import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { supabase } from '../services/supabaseClient';

const DEFAULT_CENTER = { lat: 25.6866, lng: -100.3161 }; // Monterrey

interface TrackingState {
    isDelivered: boolean;
    deliveredAt: string | null;
    driverName: string;
    clientName: string;
    lat: number | null;
    lng: number | null;
    heading: number;
    lastUpdated: string | null;
}

export const ClientLiveTracking: React.FC = () => {
    const [searchParams] = useSearchParams();
    const driverId = searchParams.get('driver') || '';
    const orderStr = searchParams.get('order') || '0';
    const clientOrder = parseInt(orderStr, 10);
    const routeType = searchParams.get('route') || 'evening';
    const clientNameParam = searchParams.get('name') || '';

    const [tracking, setTracking] = useState<TrackingState | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdatedSecs, setLastUpdatedSecs] = useState<number>(0);
    const [connActive, setConnActive] = useState<boolean>(true);

    // Fetch tracking status from Supabase
    const fetchTracking = useCallback(async () => {
        if (!driverId) {
            setLoading(false);
            return;
        }

        try {
            // Intentar llamar al RPC get_public_delivery_tracking
            const { data, error } = await supabase.rpc('get_public_delivery_tracking', {
                p_driver_id: driverId,
                p_client_order: clientOrder,
                p_route_type: routeType,
            });

            if (!error && Array.isArray(data) && data.length > 0) {
                const row = data[0];
                setTracking({
                    isDelivered: Boolean(row.is_delivered),
                    deliveredAt: row.delivered_at,
                    driverName: row.driver_name || 'Repartidor Healthy Dream',
                    clientName: row.client_name || clientNameParam || 'Cliente',
                    lat: row.lat,
                    lng: row.lng,
                    heading: Number(row.heading) || 0,
                    lastUpdated: row.last_updated,
                });
                setLoading(false);
                return;
            }

            // Fallback directo a tablas si el RPC aún no está creado en BD
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }); // YYYY-MM-DD
            const { data: logData } = await supabase
                .from('delivery_logs')
                .select('status, delivered_at, client_name')
                .eq('driver_id', driverId)
                .eq('client_order', clientOrder)
                .eq('delivery_date', today)
                .maybeSingle();

            if (logData?.status === 'delivered') {
                setTracking({
                    isDelivered: true,
                    deliveredAt: logData.delivered_at,
                    driverName: 'Repartidor Healthy Dream',
                    clientName: logData.client_name || clientNameParam || 'Cliente',
                    lat: null,
                    lng: null,
                    heading: 0,
                    lastUpdated: logData.delivered_at,
                });
                setLoading(false);
                return;
            }

            // Si no está entregado, buscar ubicación del chofer
            const { data: locData } = await supabase
                .from('driver_locations')
                .select('lat, lng, heading, updated_at')
                .eq('driver_id', driverId)
                .maybeSingle();

            setTracking({
                isDelivered: false,
                deliveredAt: null,
                driverName: 'Repartidor Healthy Dream',
                clientName: clientNameParam || 'Cliente',
                lat: locData ? Number(locData.lat) : null,
                lng: locData ? Number(locData.lng) : null,
                heading: locData ? Number(locData.heading) || 0 : 0,
                lastUpdated: locData ? locData.updated_at : null,
            });
        } catch (err) {
            console.warn('[ClientLiveTracking] Error cargando tracking:', err);
        } finally {
            setLoading(false);
        }
    }, [driverId, clientOrder, routeType, clientNameParam]);

    // Cargar inicial y escuchar canal Realtime
    useEffect(() => {
        fetchTracking();

        if (!driverId) return;

        // Suscribirse a ubicación en tiempo real vía Broadcast y cambios en BD
        const channel = supabase.channel(`gps:${driverId}`);
        channel
            .on('broadcast', { event: 'location' }, (payload: any) => {
                const data = payload?.payload;
                if (data && data.lat && data.lng) {
                    setTracking(prev => {
                        if (!prev || prev.isDelivered) return prev;
                        return {
                            ...prev,
                            lat: data.lat,
                            lng: data.lng,
                            heading: data.heading || 0,
                            lastUpdated: new Date().toISOString(),
                        };
                    });
                    setLastUpdatedSecs(0);
                }
            })
            .subscribe();

        // Polling de respaldo cada 5 segundos
        const pollInterval = setInterval(() => {
            fetchTracking();
        }, 5000);

        // Contador de segundos desde última actualización
        const secInterval = setInterval(() => {
            setLastUpdatedSecs(s => s + 1);
        }, 1000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollInterval);
            clearInterval(secInterval);
        };
    }, [driverId, fetchTracking]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0F1D] flex flex-col items-center justify-center p-6 text-white text-center">
                <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
                <h2 className="text-xl font-bold">Localizando entrega...</h2>
                <p className="text-gray-400 text-sm mt-1">Conectando con el GPS de tu repartidor</p>
            </div>
        );
    }

    if (!driverId || !tracking) {
        return (
            <div className="min-h-screen bg-[#0A0F1D] flex flex-col items-center justify-center p-6 text-white text-center">
                <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mb-4 text-3xl">
                    ⚠️
                </div>
                <h2 className="text-xl font-bold">Enlace no válido</h2>
                <p className="text-gray-400 text-sm mt-1 max-w-sm">
                    No se encontró la información de este pedido. Por favor verifica el enlace recibido en tu WhatsApp.
                </p>
            </div>
        );
    }

    // ─── PANTALLA: ENTREGA COMPLETADA (La conexión GPS se corta) ────────────────
    if (tracking.isDelivered) {
        const deliveredTimeStr = tracking.deliveredAt
            ? new Date(tracking.deliveredAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : '';

        return (
            <div className="min-h-screen bg-gradient-to-b from-[#0A1A14] to-[#0A0F1D] flex flex-col items-center justify-center p-6 text-white text-center">
                <div className="bg-[#10221A] border border-emerald-500/30 p-8 rounded-3xl max-w-md w-full shadow-[0_10px_40px_rgba(16,185,129,0.15)] flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
                    <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-4xl mb-4 border border-emerald-500/40 shadow-inner">
                        ✅
                    </div>
                    <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3 border border-emerald-500/20">
                        Entrega Finalizada
                    </span>
                    <h1 className="text-2xl font-black text-white mb-2">¡Tu pedido ha sido entregado!</h1>
                    <p className="text-emerald-200/90 text-sm mb-4">
                        Tu paquete Healthy Dream fue entregado con éxito
                        {deliveredTimeStr ? ` a las ${deliveredTimeStr}` : ''}.
                    </p>

                    <div className="w-full bg-white/[0.04] rounded-2xl p-4 border border-white/10 text-left mb-6 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-400">Repartidor:</span>
                            <span className="text-white font-semibold">{tracking.driverName}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-400">Estado de conexión GPS:</span>
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Conexión cerrada
                            </span>
                        </div>
                    </div>

                    <p className="text-[11px] text-gray-400 leading-relaxed max-w-xs">
                        🛡️ Por políticas de privacidad y seguridad de nuestro equipo de reparto, la transmisión de ubicación en vivo se desactiva inmediatamente al finalizar la entrega.
                    </p>

                    <div className="mt-6 pt-6 border-t border-white/10 w-full flex items-center justify-center gap-2 text-xs text-emerald-400 font-bold">
                        <span>🍏 Healthy Dream</span>
                        <span className="text-gray-600">•</span>
                        <span>¡Buen provecho!</span>
                    </div>
                </div>
            </div>
        );
    }

    // ─── PANTALLA: REPARTIDOR EN CAMINO (Mapa en Vivo) ──────────────────────────
    const mapCenter = tracking.lat && tracking.lng
        ? { lat: tracking.lat, lng: tracking.lng }
        : DEFAULT_CENTER;

    return (
        <div className="relative min-h-screen w-full bg-[#0A0F1D] flex flex-col text-white overflow-hidden">
            {/* Header Flotante */}
            <header className="absolute top-4 left-4 right-4 z-20 bg-[#0F172A]/90 backdrop-blur-md border border-white/10 rounded-2xl p-3.5 shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-2xl">
                        🛵
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-bold text-white">Tu repartidor va en camino</h2>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        </div>
                        <p className="text-[11px] text-gray-400">
                            Repartidor: <span className="text-gray-200 font-semibold">{tracking.driverName}</span>
                        </p>
                    </div>
                </div>

                <div className="text-right">
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                        EN VIVO
                    </span>
                    <p className="text-[9px] text-gray-400 mt-1">
                        {lastUpdatedSecs < 10 ? 'Actualizado ahora' : `Hace ${lastUpdatedSecs}s`}
                    </p>
                </div>
            </header>

            {/* Mapa Interactivo */}
            <div className="flex-1 w-full h-full min-h-[500px]">
                {tracking.lat && tracking.lng ? (
                    <Map
                        defaultCenter={mapCenter}
                        center={mapCenter}
                        defaultZoom={16}
                        zoom={16}
                        gestureHandling="greedy"
                        disableDefaultUI={false}
                        className="w-full h-full"
                    >
                        {/* Marcador del Repartidor */}
                        <AdvancedMarker position={mapCenter} title={tracking.driverName}>
                            <div className="relative flex flex-col items-center">
                                <div className="px-2.5 py-1 bg-black/80 backdrop-blur-md text-white text-[10px] font-bold rounded-full border border-emerald-500 shadow-lg whitespace-nowrap mb-1">
                                    🛵 {tracking.driverName}
                                </div>
                                <div className="w-10 h-10 rounded-full bg-emerald-500 border-2 border-white shadow-xl flex items-center justify-center text-lg animate-bounce">
                                    🍏
                                </div>
                            </div>
                        </AdvancedMarker>
                    </Map>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-gray-400">
                        <span className="text-4xl mb-2">📡</span>
                        <p className="text-sm font-semibold text-white">Esperando señal GPS del repartidor...</p>
                        <p className="text-xs text-gray-500 mt-1 max-w-xs">
                            El repartidor acaba de iniciar su trayecto. En unos segundos se visualizará su posición en el mapa.
                        </p>
                    </div>
                )}
            </div>

            {/* Tarjeta Inferior de Información */}
            <footer className="p-4 bg-[#0F172A] border-t border-white/10 z-20">
                <div className="max-w-md mx-auto flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Healthy Dream Reparto</p>
                        <p className="text-xs text-gray-200 font-medium">Mantén esta pantalla abierta para ver el avance</p>
                    </div>
                    <button
                        onClick={() => fetchTracking()}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-xs font-bold rounded-lg border border-white/10 flex items-center gap-1.5"
                    >
                        <span>🔄</span> Actualizar
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default ClientLiveTracking;
