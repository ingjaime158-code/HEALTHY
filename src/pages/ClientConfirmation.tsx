import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicTripDetails, confirmTripCost } from '../services/api/tripService';
import { formatCurrency } from '../utils/format';

const ClientConfirmation = () => {
    const { tripId } = useParams();
    const [trip, setTrip] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [confirmedBy, setConfirmedBy] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const loadTrip = async () => {
            if (!tripId) {
                setError('ID de entrega no proporcionado.');
                setLoading(false);
                return;
            }
            try {
                const data = await getPublicTripDetails(tripId);
                if (!data) {
                    setError('Entrega no encontrada o expirada.');
                } else {
                    setTrip(data);
                    if (data.client_confirmed) {
                        setConfirmed(true);
                    }
                }
            } catch (err) {
                console.error(err);
                setError('Error al cargar la información de la entrega.');
            }
            setLoading(false);
        };
        loadTrip();
    }, [tripId]);

    const handleConfirm = async () => {
        if (!tripId) return;
        if (!confirmedBy.trim()) {
            setError('Por favor, ingresa tu nombre para confirmar.');
            return;
        }
        setConfirming(true);
        setError('');
        try {
            const result = await confirmTripCost(tripId, confirmedBy.trim());
            if (result.success) {
                setConfirmed(true);
                setTrip(prev => ({ ...prev, client_confirmed: true, confirmed_by_name: confirmedBy.trim() }));
            } else {
                setError(result.error || 'No se pudo confirmar la entrega. Por favor intenta de nuevo.');
            }
        } catch (err: any) {
            console.error(err);
            setError('Error al procesar la confirmación: ' + (err?.message || ''));
        }
        setConfirming(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                <p className="text-gray-500">Cargando detalles de la entrega...</p>
            </div>
        );
    }

    if (error && !trip) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center border-t-4 border-red-500">
                    <span className="material-symbols-outlined text-5xl text-red-500 mb-4">error</span>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Oops...</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                </div>
            </div>
        );
    }



    return (
        <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4 font-sans">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden my-4">
                {/* Header */}
                <div className="bg-slate-900 px-6 py-8 text-center relative">
                    <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20">
                        {/* Abstract pattern */}
                        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-500 blur-3xl"></div>
                        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-purple-500 blur-3xl"></div>
                    </div>
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="bg-white/10 p-4 rounded-full mb-4 backdrop-blur-sm border border-white/20">
                            <span className="material-symbols-outlined notranslate text-4xl text-white" translate="no">receipt_long</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-wide">Healthy Dream <span className="font-light">Logística</span></h1>
                        <p className="text-slate-300 mt-2 text-sm">Resumen de Carrera</p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Status Badge */}
                    <div className="flex justify-center mb-8 -mt-10 relative z-20">
                        {confirmed ? (
                            <span className="bg-green-500 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 border-4 border-white">
                                <span className="material-symbols-outlined notranslate text-xl" translate="no">check_circle</span>
                                Costo Confirmado
                            </span>
                        ) : (
                            <span className="bg-amber-500 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 border-4 border-white animate-pulse">
                                <span className="material-symbols-outlined notranslate text-xl" translate="no">pending_actions</span>
                                Pendiente de Confirmación
                            </span>
                        )}
                    </div>

                    <div className="space-y-6">
                        {/* Client/Base Info */}
                        <div className="text-center mb-2">
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Cliente / Destinatario</p>
                            <p className="text-lg font-bold text-slate-800">{trip?.client_name || 'No especificado'}</p>
                        </div>

                        {/* Date and Time Info */}
                        {trip?.created_at && (
                            <div className="text-center mb-2 bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 flex items-center justify-center gap-3">
                                <span className="material-symbols-outlined notranslate text-slate-400 text-xl" translate="no">calendar_month</span>
                                <div className="text-left">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-1">Fecha de Creación</p>
                                    <p className="text-sm font-bold text-slate-700 leading-none">
                                        {new Date(trip.created_at).toLocaleDateString('es-MX', {
                                            weekday: 'short',
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric'
                                        })} a las {new Date(trip.created_at).toLocaleTimeString('es-MX', {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Origin/Stops/Dest */}
                        {(() => {
                            const stops: { address: string; lat: number; lng: number }[] = (() => {
                                try {
                                    if (Array.isArray(trip?.stops)) return trip.stops;
                                    if (typeof trip?.stops === 'string') return JSON.parse(trip.stops || '[]');
                                } catch { }
                                return [];
                            })();
                            return (
                                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center mt-1">
                                            <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
                                            <div className="w-0.5 flex-1 bg-slate-300 my-1"></div>
                                            {stops.map((_, idx) => (
                                                <React.Fragment key={idx}>
                                                    <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[9px] font-black shadow-sm">{idx + 1}</div>
                                                    <div className="w-0.5 flex-1 bg-slate-300 my-1"></div>
                                                </React.Fragment>
                                            ))}
                                            <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
                                        </div>
                                        <div className="flex-1 space-y-4">
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Origen</p>
                                                <p className="text-sm font-bold text-slate-800 leading-snug">{trip?.origin || 'No especificado'}</p>
                                            </div>
                                            {stops.map((stop, idx) => (
                                                <div key={idx}>
                                                    <p className="text-[10px] text-orange-400 font-bold uppercase tracking-widest mb-1">Parada {idx + 1}</p>
                                                    <p className="text-sm font-bold text-slate-800 leading-snug">{stop.address}</p>
                                                </div>
                                            ))}
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">{stops.length > 0 ? 'Destino Final' : 'Destino'}</p>
                                                <p className="text-sm font-bold text-slate-800 leading-snug">{trip?.destination || 'No especificado'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Cost Block */}
                        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 text-center">
                            <p className="text-blue-600 font-bold text-sm uppercase tracking-wider mb-2">Costo Total de la Entrega</p>
                            <p className="text-4xl font-extrabold text-slate-900">{formatCurrency(trip?.cost || 0)}</p>
                            <p className="text-xs text-blue-500 mt-2 font-medium bg-blue-100 inline-block px-3 py-1 rounded-full">Tarifa de la entrega</p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-8">
                        {confirmed ? (
                            <div className="bg-green-50 rounded-2xl p-6 text-center border border-green-100">
                                <span className="material-symbols-outlined notranslate text-green-500 text-4xl mb-2" translate="no">task_alt</span>
                                <h3 className="text-green-800 font-bold text-lg">¡Gracias por confirmar{trip?.confirmed_by_name ? `, ${trip.confirmed_by_name}` : ''}!</h3>
                                <p className="text-green-600 text-sm mt-2">El operador ha sido notificado y tu entrega está programada.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Nombre de quien confirma:</label>
                                    <input
                                        type="text"
                                        placeholder="Ej. Juan Pérez (Recepción)"
                                        className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-bold focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all placeholder-slate-400"
                                        value={confirmedBy}
                                        onChange={(e) => {
                                            setConfirmedBy(e.target.value);
                                            setError('');
                                        }}
                                        autoFocus
                                    />
                                </div>
                                {error && (
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                                        <span className="material-symbols-outlined notranslate text-red-500 text-lg shrink-0 mt-0.5" translate="no">warning</span>
                                        <p className="text-red-600 text-xs font-medium">{error}</p>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={handleConfirm}
                                    disabled={confirming || !confirmedBy.trim()}
                                    className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {confirming ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                            <span>Procesando...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined notranslate" translate="no">thumb_up</span>
                                            <span>Confirmar Costo</span>
                                        </>
                                    )}
                                </button>
                                <p className="text-center text-xs text-slate-500 font-medium">
                                    Al confirmar aceptas que este es el costo de la carrera solicitada.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-50 border-t border-slate-100 py-4 text-center">
                    <p className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1">
                        <span className="material-symbols-outlined notranslate text-[14px]" translate="no">lock</span>
                        Plataforma Segura Healthy Dream 2026
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ClientConfirmation;
