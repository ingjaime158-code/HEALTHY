import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../services/supabaseClient';

const DEFAULT_CENTER: [number, number] = [25.6866, -100.3161]; // Monterrey

// Haversine formula to calculate distance between two coordinates in kilometers
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

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
    const destParam = searchParams.get('dest') || ''; // Format: "lat,lng"

    // Parse destination coordinates if available
    const destCoords = useMemo<[number, number] | null>(() => {
        if (!destParam) return null;
        const parts = destParam.split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return [parts[0], parts[1]];
        }
        return null;
    }, [destParam]);

    const [tracking, setTracking] = useState<TrackingState | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdatedSecs, setLastUpdatedSecs] = useState<number>(0);

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const driverMarkerRef = useRef<L.Marker | null>(null);
    const destMarkerRef = useRef<L.Marker | null>(null);

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

        // Suscribirse a ubicación en tiempo real vía Broadcast
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

    // Calcular ETA y distancia
    const etaInfo = useMemo(() => {
        if (!tracking?.lat || !tracking?.lng) {
            return {
                title: 'Tiempo estimado de llegada',
                timeText: 'Localizando...',
                subtitle: 'Conectando con el GPS del repartidor',
                isNear: false
            };
        }

        if (destCoords) {
            const distKm = getDistanceFromLatLonInKm(tracking.lat, tracking.lng, destCoords[0], destCoords[1]);
            
            if (distKm <= 0.35) {
                return {
                    title: '¡El repartidor está llegando!',
                    timeText: 'Menos de 2 min',
                    subtitle: 'Tu repartidor está a unos metros de tu domicilio',
                    isNear: true
                };
            }

            // Velocidad urbana promedio en tráfico: 26 km/h + 2 min margen de estacionamiento
            const minutes = Math.max(3, Math.round((distKm / 26) * 60) + 2);
            const distDisplay = distKm < 1 ? `${Math.round(distKm * 1000)} metros` : `${distKm.toFixed(1)} km`;

            return {
                title: 'Tiempo estimado de llegada',
                timeText: `~${minutes} minutos`,
                subtitle: `Aproximadamente a ${distDisplay} de tu domicilio`,
                isNear: false
            };
        }

        // Si no se pasaron coordenadas del cliente en la URL
        return {
            title: 'Tiempo estimado de llegada',
            timeText: 'En camino',
            subtitle: 'Tu repartidor está en ruta activa hacia tu entrega',
            isNear: false
        };
    }, [tracking?.lat, tracking?.lng, destCoords]);

    // Inicializar y actualizar Leaflet Map con OpenStreetMap 100% libre de claves
    useEffect(() => {
        if (!tracking || tracking.isDelivered || !tracking.lat || !tracking.lng) {
            return;
        }

        const driverCoords: [number, number] = [tracking.lat, tracking.lng];

        if (!mapInstanceRef.current && mapContainerRef.current) {
            // Inicializar mapa
            const map = L.map(mapContainerRef.current, {
                center: driverCoords,
                zoom: 16,
                zoomControl: false,
            });

            // Capa 100% gratuita y oficial de OpenStreetMap (NUNCA requiere API key ni tiene marcas de agua)
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
                subdomains: ['a', 'b', 'c'],
            }).addTo(map);

            // Control de zoom discreto en la parte superior derecha
            L.control.zoom({ position: 'topright' }).addTo(map);

            // Icono del repartidor: AUTO 🚗 con etiqueta de nombre
            const carIcon = L.divIcon({
                className: 'custom-driver-pin',
                html: `
                    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -100%);pointer-events:none;">
                        <div style="background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);border:1px solid #10b981;color:#ffffff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.4);margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                            <span>🚗</span><span>${tracking.driverName}</span>
                        </div>
                        <div style="width:44px;height:44px;background:#10b981;border:3px solid #ffffff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(16,185,129,0.55);font-size:22px;">
                            🚗
                        </div>
                    </div>
                `,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
            });

            const marker = L.marker(driverCoords, { icon: carIcon }).addTo(map);
            driverMarkerRef.current = marker;

            // Si hay destino del cliente, agregar marcador de entrega 📍
            if (destCoords) {
                const destIcon = L.divIcon({
                    className: 'custom-dest-pin',
                    html: `
                        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -100%);pointer-events:none;">
                            <div style="background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);border:1px solid #ef4444;color:#ffffff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:16px;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,0.3);margin-bottom:3px;">
                                📍 Tu Entrega
                            </div>
                            <div style="width:36px;height:36px;background:#ef4444;border:2.5px solid #ffffff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(239,68,68,0.5);font-size:18px;">
                                🏡
                            </div>
                        </div>
                    `,
                    iconSize: [0, 0],
                    iconAnchor: [0, 0],
                });

                const dMarker = L.marker(destCoords, { icon: destIcon }).addTo(map);
                destMarkerRef.current = dMarker;

                // Ajustar zoom para que quepan ambos puntos
                const bounds = L.latLngBounds([driverCoords, destCoords]);
                map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16 });
            }

            mapInstanceRef.current = map;
        } else if (mapInstanceRef.current && driverMarkerRef.current) {
            // Actualizar posición del auto suavemente
            driverMarkerRef.current.setLatLng(driverCoords);
            if (!destCoords) {
                mapInstanceRef.current.panTo(driverCoords, { animate: true, duration: 1 });
            }
        }
    }, [tracking?.lat, tracking?.lng, tracking?.driverName, tracking?.isDelivered, destCoords]);

    // Limpieza al desmontar
    useEffect(() => {
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

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

    // ─── PANTALLA: REPARTIDOR EN CAMINO (Mapa Oficial OpenStreetMap) ────────────
    return (
        <div className="relative h-screen w-screen bg-[#0A0F1D] flex flex-col text-white overflow-hidden">
            {/* Header Flotante */}
            <header className="absolute top-4 left-4 right-4 z-[1000] bg-[#0F172A]/90 backdrop-blur-md border border-white/10 rounded-2xl p-3.5 shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-2xl">
                        🚗
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

            {/* Contenedor del Mapa OpenStreetMap (Leaflet) a pantalla completa */}
            <div className="absolute inset-0 w-full h-full z-0">
                {tracking.lat && tracking.lng ? (
                    <div ref={mapContainerRef} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-gray-400 bg-[#0A0F1D]">
                        <span className="text-4xl mb-2">📡</span>
                        <p className="text-sm font-semibold text-white">Esperando señal GPS del repartidor...</p>
                        <p className="text-xs text-gray-500 mt-1 max-w-xs">
                            El repartidor acaba de iniciar su trayecto. En unos segundos se visualizará su posición en el mapa.
                        </p>
                    </div>
                )}
            </div>

            {/* Footer Flotante: TIEMPO ESTIMADO DE LLEGADA DEL REPARTIDOR */}
            <footer className="absolute bottom-4 left-4 right-4 z-[1000] bg-[#0F172A]/95 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl">
                <div className="max-w-md mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-2xl shadow-inner">
                            ⏱️
                        </div>
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                                {etaInfo.title}
                            </p>
                            <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                                {etaInfo.timeText}
                                {etaInfo.isNear && (
                                    <span className="text-[10px] bg-emerald-500 text-black font-black px-2 py-0.5 rounded-full uppercase">
                                        ¡Llegando!
                                    </span>
                                )}
                            </h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                                {etaInfo.subtitle}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end justify-center">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-gray-300 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            GPS Activo
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default ClientLiveTracking;
