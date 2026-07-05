import React, { useState } from 'react';
import { Trip, Business, Driver } from '../services/dataService';
import { DriverRouteInfo } from '../services/routeMonitorService';

export interface DispatchSidebarProps {
    isDispatchOpen: boolean;
    setIsDispatchOpen: (open: boolean) => void;
    selectedRoute: 'morning' | 'evening' | null;
    activeTrips: Trip[];
    setActiveTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
    routeDrivers: DriverRouteInfo[];
    selectedDriverForDetails: DriverRouteInfo | null;
    setSelectedDriverForDetails: (driver: DriverRouteInfo | null) => void;
    driverColors: { [key: string]: string };
    loadingRoute: boolean;
    businesses: Business[];
    drivers: Driver[];
    selectedMapTripId: string | null;
    setSelectedMapTripId: (id: string | null) => void;
    updateTrip: (update: Partial<Trip> & { id: string }) => Promise<boolean>;
    updateTripStatus: (id: string, status: string) => Promise<boolean>;

    showToast: (message: string, type: 'success'|'error'|'info') => void;
    handleCopyClientLinkSidebar: (trip: Trip, e: React.MouseEvent) => void;
    handleCopyTrip: (trip: Trip, e: React.MouseEvent) => void;
    copiedClientTripId: string | null;
    copiedTripId: string | null;
    calcWaitCost: (minutes: number, ratePerMin: number) => number;

    handleSelectRoute: (route: 'morning' | 'evening' | null) => Promise<void>;
    showTraffic: boolean;
    setShowTraffic: (show: boolean) => void;
}

const DRIVER_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'
];

const DispatchSidebar: React.FC<DispatchSidebarProps> = ({
    isDispatchOpen, setIsDispatchOpen,
    selectedRoute, activeTrips, setActiveTrips,
    routeDrivers, selectedDriverForDetails, setSelectedDriverForDetails,
    driverColors, loadingRoute, businesses, drivers,
    selectedMapTripId, setSelectedMapTripId,
    updateTrip, updateTripStatus,
    showToast, handleCopyClientLinkSidebar, handleCopyTrip,
    copiedClientTripId, copiedTripId, calcWaitCost,
    handleSelectRoute, showTraffic, setShowTraffic
}) => {
    const [editingTripId, setEditingTripId] = useState<string | null>(null);
    const [editTripFields, setEditTripFields] = useState<{ clientName: string; driverId: string; waitTimeMinutes: number; waitTimeCost: number; cost: number; scheduledAt?: string }>({ clientName: '', driverId: '', waitTimeMinutes: 0, waitTimeCost: 0, cost: 0, scheduledAt: '' });
    const [editWaitRate, setEditWaitRate] = useState<number>(0);
    const [savingEdit, setSavingEdit] = useState(false);

    return (
            <div className={`absolute top-0 bottom-0 right-0 z-[700] flex items-stretch transition-all duration-300 ${isDispatchOpen ? 'w-[400px]' : 'w-0'}`}>
                {/* Toggle Button */}
                <button
                    onClick={() => setIsDispatchOpen(!isDispatchOpen)}
                    className="absolute -left-10 top-1/2 -translate-y-1/2 z-40 w-10 h-24 bg-black/70 backdrop-blur-md border border-white/10 border-r-0 rounded-l-xl flex items-center justify-center text-white hover:bg-black/90 transition-all shadow-xl"
                    title={isDispatchOpen ? 'Ocultar Despacho' : 'Mostrar Despacho'}
                >
                    <div className="flex flex-col items-center gap-1">
                        <span className="material-symbols-outlined text-[18px]">{isDispatchOpen ? 'chevron_right' : 'chevron_left'}</span>
                        {!isDispatchOpen && <span className="text-[8px] font-bold uppercase tracking-wider writing-mode-vertical" style={{ writingMode: 'vertical-lr' }}>Despacho</span>}
                        {!isDispatchOpen && activeTrips.length > 0 && (
                            <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">{activeTrips.length}</span>
                        )}
                    </div>
                </button>

                {/* Panel Content */}
                <div className={`w-full h-full flex flex-col bg-[#0f0f1a] border-l border-white/10 shadow-2xl overflow-hidden transition-all duration-300 ${isDispatchOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <div className="px-5 py-4 border-b border-white/[0.06] flex justify-between items-center bg-white/[0.02] shrink-0 gap-3">
                        <div className="min-w-0 flex-1">
                            <h3 className="text-white text-[15px] font-bold leading-tight tracking-tight truncate">
                                {selectedRoute === 'morning' ? '☀️ Ruta Matutina' : selectedRoute === 'evening' ? '🌙 Ruta Vespertina' : 'Monitor en Vivo'}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                </span>
                                <span className="text-gray-500 text-[11px] font-medium truncate">
                                    {selectedRoute ? `${routeDrivers.length} Repartidores` : `Sistema En Línea • ${activeTrips.length} Activos`}
                                </span>
                            </div>
                        </div>

                        {/* Route and Traffic Control Buttons */}
                        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] p-1 rounded-xl shrink-0">
                            {/* Sun (Matutina) */}
                            <button
                                onClick={() => handleSelectRoute(selectedRoute === 'morning' ? null : 'morning')}
                                className={`p-1.5 rounded-lg transition-all duration-200 flex items-center justify-center cursor-pointer ${
                                    selectedRoute === 'morning'
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border border-transparent'
                                }`}
                                title="Ruta Matutina"
                            >
                                <span className="material-symbols-outlined text-[16px]">light_mode</span>
                            </button>

                            {/* Moon (Vespertina) */}
                            <button
                                onClick={() => handleSelectRoute(selectedRoute === 'evening' ? null : 'evening')}
                                className={`p-1.5 rounded-lg transition-all duration-200 flex items-center justify-center cursor-pointer ${
                                    selectedRoute === 'evening'
                                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border border-transparent'
                                }`}
                                title="Ruta Vespertina"
                            >
                                <span className="material-symbols-outlined text-[16px]">dark_mode</span>
                            </button>

                            {/* Divider */}
                            <div className="w-px h-4 bg-white/10 mx-0.5"></div>

                            {/* Traffic Layer */}
                            <button
                                onClick={() => setShowTraffic(!showTraffic)}
                                className={`p-1.5 rounded-lg transition-all duration-200 flex items-center justify-center cursor-pointer ${
                                    showTraffic
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border border-transparent'
                                }`}
                                title="Mostrar Tráfico"
                            >
                                <span className="material-symbols-outlined text-[16px]">traffic</span>
                            </button>
                        </div>

                        <button onClick={() => setIsDispatchOpen(false)} className="text-gray-500 hover:text-gray-300 p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors shrink-0">
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 scrollbar-hide">
                        {/* Route Driver Cards or Driver Details */}
                        {selectedDriverForDetails ? (
                            <div className="flex flex-col gap-3 pb-6">
                                {/* Back button and Driver Summary Header */}
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 shrink-0">
                                    <button 
                                        onClick={() => setSelectedDriverForDetails(null)}
                                        className="flex items-center gap-1 text-gray-400 hover:text-white mb-3 transition-colors text-xs font-bold bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md w-fit cursor-pointer relative z-50"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                                        Volver a Repartidores
                                    </button>
                                    
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shadow-lg shrink-0"
                                                style={{ backgroundColor: `${selectedDriverForDetails?.colorHex || '#3B82F6'}30`, color: selectedDriverForDetails?.colorHex || '#3B82F6', border: `1px solid ${selectedDriverForDetails?.colorHex || '#3B82F6'}40` }}
                                            >
                                                {selectedDriverForDetails?.driverName ? selectedDriverForDetails.driverName.substring(0, 2) : 'DR'}
                                            </div>
                                            <div>
                                                <p className="text-white text-sm font-semibold tracking-tight">{selectedDriverForDetails?.driverName || 'Repartidor'}</p>
                                                <p className="text-gray-500 text-[10px] font-medium">{selectedDriverForDetails?.totalClients || 0} clientes asignados</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-gray-500 text-[10px] font-medium">
                                            {selectedDriverForDetails?.deliveredCount || 0} de {selectedDriverForDetails?.totalClients || 0} entregas
                                        </span>
                                        <span className="text-emerald-400 text-[10px] font-bold">
                                            {selectedDriverForDetails?.totalClients ? Math.round(((selectedDriverForDetails.deliveredCount || 0) / selectedDriverForDetails.totalClients) * 100) : 0}%
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-white/[0.08] rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500 ease-out"
                                            style={{
                                                width: `${selectedDriverForDetails?.totalClients ? ((selectedDriverForDetails.deliveredCount || 0) / selectedDriverForDetails.totalClients) * 100 : 0}%`,
                                                backgroundColor: selectedDriverForDetails?.colorHex || '#3B82F6',
                                            }}
                                        />
                                    </div>
                                </div>
                                
                                {/* Clients List */}
                                <div className="flex flex-col gap-2">
                                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider px-1 mb-1">
                                        {selectedDriverForDetails?.clients?.length || 0} CLIENTES EN RUTA
                                    </p>
                                    {(selectedDriverForDetails?.clients || []).map((client, cIdx) => (
                                        <div key={cIdx} className="bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] rounded-lg p-3 flex items-start gap-3 transition-colors">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${client.isDelivered ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-gray-700/50 text-gray-300 border border-gray-600/50'}`}>
                                                {client.order < 9999 ? client.order : cIdx + 1}
                                            </div>
                                            <div className="min-w-0 flex-1 flex flex-col justify-center min-h-[32px]">
                                                <div className="flex items-center gap-2">
                                                    <p className={`text-sm font-bold truncate ${client.isDelivered ? 'text-gray-400 line-through' : 'text-gray-100'}`}>
                                                        {client.name || 'Cliente sin nombre'}
                                                    </p>
                                                    {client.bags > 0 && !client.isDelivered && (
                                                        <span className="px-1.5 py-0.5 rounded bg-pink-500/20 border border-pink-500/30 text-pink-400 text-[9px] font-black uppercase flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-[10px]">shopping_bag</span>
                                                            {client.bags} {client.bags === 1 ? 'bolsa' : 'bolsas'}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-gray-500 text-[10px] truncate flex items-center gap-1 mt-0.5" title={client.address || 'Ubicación'}>
                                                    <span className="material-symbols-outlined text-[11px] text-red-400">location_on</span>
                                                    {client.address || 'Ubicación de entrega'}
                                                </p>
                                                {!client.isDelivered && (client.estimatedTimeClock || client.estimatedTimeMins !== undefined) && (
                                                    <div className="text-[10px] font-extrabold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 flex items-center gap-1 w-fit mt-1 shadow-sm shadow-amber-500/5">
                                                        <span className="material-symbols-outlined text-[11px] font-black">schedule</span>
                                                        Llegada est.: {client.estimatedTimeClock ? client.estimatedTimeClock : `${client.estimatedTimeMins} min`}
                                                    </div>
                                                )}
                                                {client.isDelivered && client.estimatedTimeClock && (
                                                    <div className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1 w-fit mt-1 shadow-sm shadow-emerald-500/5">
                                                        <span className="material-symbols-outlined text-[11px] font-black">task_alt</span>
                                                        {client.estimatedTimeClock}
                                                    </div>
                                                )}
                                            </div>
                                            {client.isDelivered && (
                                                <span className="material-symbols-outlined text-emerald-400 text-[20px] shrink-0 self-center">check_circle</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : selectedRoute && routeDrivers.length > 0 ? (
                            routeDrivers.map((driver, idx) => {
                                const color = driver.colorHex || DRIVER_COLORS[idx % DRIVER_COLORS.length];
                                const pct = driver.totalClients > 0 ? Math.round((driver.deliveredCount / driver.totalClients) * 100) : 0;
                                const statusConfig = {
                                    en_curso: { label: 'En Curso', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-400' },
                                    finalizada: { label: 'Finalizada', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
                                    sin_iniciar: { label: 'Sin Iniciar', bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/20', dot: 'bg-gray-400' },
                                };
                                const sc = statusConfig[driver.status];

                                return (
                                    <div 
                                        key={driver.driverName} 
                                        onClick={() => setSelectedDriverForDetails(driver)}
                                        className="bg-white/[0.03] border border-white/[0.06] border-l-[3px] rounded-xl p-4 hover:bg-white/[0.08] hover:border-white/[0.1] transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md"
                                        style={{ borderLeftColor: color }}
                                    >
                                        {/* Driver Header */}
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shadow-lg"
                                                    style={{ backgroundColor: `${color}30`, color: color, border: `1px solid ${color}40` }}
                                                >
                                                    {driver.driverName.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-semibold tracking-tight">{driver.driverName}</p>
                                                    <p className="text-gray-500 text-[10px] font-medium">{driver.totalClients} clientes asignados</p>
                                                </div>
                                            </div>
                                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${sc.bg} border ${sc.border}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${driver.status === 'en_curso' ? 'animate-pulse' : ''}`}></div>
                                                <span className={`text-[10px] font-bold ${sc.text}`}>{sc.label}</span>
                                            </div>
                                        </div>

                                        {/* Current Client */}
                                        {driver.currentClient && (
                                            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-white/[0.03] rounded-lg border border-white/[0.04]">
                                                <span className="material-symbols-outlined text-[14px] text-blue-400">location_on</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-wider">Próximo cliente</p>
                                                    <p className="text-gray-200 text-xs font-medium truncate">{driver.currentClient}</p>
                                                </div>
                                            </div>
                                        )}
                                        {driver.status === 'finalizada' && (
                                            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-emerald-500/[0.06] rounded-lg border border-emerald-500/10">
                                                <span className="material-symbols-outlined text-[14px] text-emerald-400">check_circle</span>
                                                <p className="text-emerald-400 text-xs font-semibold">Todas las entregas completadas</p>
                                            </div>
                                        )}

                                        {/* Progress Bar */}
                                        <div className="mb-2">
                                            <div className="flex justify-between items-center mb-1.5">
                                                <span className="text-gray-500 text-[10px] font-medium">
                                                    {driver.deliveredCount} / {driver.totalClients} entregas
                                                </span>
                                                <span className="text-gray-400 text-[10px] font-bold">{pct}%</span>
                                            </div>
                                            <div className="w-full h-2 bg-white/[0.08] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500 ease-out"
                                                    style={{
                                                        width: `${pct}%`,
                                                        backgroundColor: pct >= 100 ? '#10B981' : color,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Last delivery time */}
                                        {driver.lastDeliveredAt && (
                                            <p className="text-gray-600 text-[9px] font-medium mt-1">
                                                Última entrega: {new Date(driver.lastDeliveredAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                );
                            })
                        ) : selectedRoute && loadingRoute ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-3">
                                <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin"></div>
                                <p className="text-gray-500 text-xs font-medium">Cargando repartidores...</p>
                            </div>
                        ) : selectedRoute && routeDrivers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-2">
                                <span className="material-symbols-outlined text-[32px] text-gray-600">person_off</span>
                                <p className="text-gray-500 text-xs font-medium">No hay repartidores activos en esta ruta</p>
                            </div>
                        ) : !selectedRoute && activeTrips.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-2">
                                <span className="material-symbols-outlined text-[32px] text-gray-600">local_shipping</span>
                                <p className="text-gray-500 text-xs font-medium text-center">Selecciona una ruta para ver<br/>los repartidores activos</p>
                            </div>
                        ) : (
                            [...activeTrips]
                                .sort((a, b) => {
                                    const timeA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : new Date(a.createdAt || 0).getTime();
                                    const timeB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : new Date(b.createdAt || 0).getTime();
                                    return timeA - timeB;
                                })
                                .map((trip, index) => {
                                    const TRIP_COLORS = [
                                        '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#e11d48', '#0891b2', '#ea580c', '#65a30d', '#db2777'
                                    ];
                                    const color = TRIP_COLORS[index % TRIP_COLORS.length];

                                    // Lógica de Tiempos (Retraso o Espera)
                                    const scheduledDate = trip.scheduledAt ? new Date(trip.scheduledAt) : null;
                                    const nowMs = new Date().getTime();

                                    const delayMins = (() => {
                                        if (!scheduledDate) return 0;
                                        const diff = Math.floor((nowMs - scheduledDate.getTime()) / 60000);
                                        return diff > 0 ? diff : 0;
                                    })();

                                    const minsUntilScheduled = (() => {
                                        if (!scheduledDate) return 0;
                                        const diff = Math.floor((scheduledDate.getTime() - nowMs) / 60000);
                                        return diff > 0 ? diff : 0;
                                    })();

                                    const waitMins = (() => {
                                        if (trip.driverArrivedAt) {
                                            const arrived = new Date(trip.driverArrivedAt).getTime();
                                            if (scheduledDate) {
                                                // Scheduled trip: timer starts at MAX(scheduled_time, arrived_time)
                                                const startCounterAt = Math.max(scheduledDate.getTime(), arrived);
                                                if (nowMs < startCounterAt) return 0;
                                                return Math.floor((nowMs - startCounterAt) / 60000);
                                            } else {
                                                // Non-scheduled trip: timer starts when driver arrives
                                                if (nowMs < arrived) return 0;
                                                return Math.floor((nowMs - arrived) / 60000);
                                            }
                                        }
                                        return 0;
                                    })();
                                    const isGracePeriodOver = waitMins >= 21;

                                    // Hora programada formateada
                                    const scheduledTimeStr = scheduledDate
                                        ? scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : null;
                                    
                                    const scheduledDateStrRaw = scheduledDate 
                                        ? scheduledDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }).replace(',', '')
                                        : '';
                                    const scheduledDateStr = scheduledDateStrRaw.charAt(0).toUpperCase() + scheduledDateStrRaw.slice(1);

                                    return (
                                        <div
                                            key={trip.id || index}
                                            onClick={() => setSelectedMapTripId(selectedMapTripId === trip.id ? null : trip.id)}
                                            className={`border p-4 rounded-xl hover:bg-white/10 transition-colors group cursor-pointer ${
                                                selectedMapTripId === trip.id 
                                                ? 'bg-blue-900/30 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                                                : 'bg-white/5 border-white/10'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-start gap-2">
                                                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ring-1 ring-white/20 shrink-0" style={{ backgroundColor: `${color}33`, color: color }}>
                                                        {trip.clientName ? trip.clientName.substring(0, 2).toUpperCase() : 'US'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-white text-sm font-bold leading-tight truncate">{trip.clientName || 'Cliente'}</p>
                                                        {scheduledTimeStr ? (
                                                            <p className="text-amber-400 text-[10px] font-bold flex items-center gap-0.5">
                                                                <span className="material-symbols-outlined text-[11px]">schedule</span>
                                                                {scheduledDateStr} {scheduledTimeStr}
                                                                {minsUntilScheduled > 0 && (
                                                                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 font-bold text-[10px] border border-amber-500/40">en {minsUntilScheduled}m</span>
                                                                )}
                                                            </p>
                                                        ) : (
                                                            <p className="text-gray-400 text-[10px]">{trip.time}</p>
                                                        )}
                                                        {trip.driver && trip.driver !== 'Unknown' && (
                                                            <p className="text-blue-300 text-[10px] font-medium flex items-center gap-0.5 truncate">
                                                                <span className="material-symbols-outlined text-[10px]">person</span>
                                                                {trip.driver}
                                                            </p>
                                                        )}
                                                        {trip.businessId && (
                                                            <p className="text-purple-300 text-[10px] font-medium flex items-center gap-0.5 truncate">
                                                                <span className="material-symbols-outlined text-[10px]">business</span>
                                                                {businesses.find(b => b.id === trip.businessId)?.name || 'Cliente'}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-500 uppercase tracking-wide border border-yellow-500/20 whitespace-nowrap">
                                                        {trip.status}
                                                    </span>

                                                {/* Contadores de Tiempo — MÁS GRANDES Y VISIBLES */}
                                                {waitMins > 0 && !trip.tripStartedAt ? (
                                                    <span className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 border animate-in zoom-in duration-300 ${isGracePeriodOver ? 'bg-red-600 text-white border-red-400 shadow-[0_0_12px_rgba(220,38,38,0.6)]' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'}`}>
                                                        <span className="material-symbols-outlined text-[16px]">{isGracePeriodOver ? 'alarm_on' : 'timer'}</span>
                                                        <span className="text-sm font-mono">{waitMins}m</span>
                                                    </span>
                                                ) : (delayMins >= 0 && minsUntilScheduled === 0 && scheduledDate) ? (
                                                    <span className="px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 bg-red-500/25 text-red-400 border border-red-500/40 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.4)]">
                                                        <span className="material-symbols-outlined text-[16px]">schedule</span>
                                                        <span className="text-sm font-mono">{delayMins}m</span>
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="space-y-2 relative pl-3 border-l ml-1.5 my-3" style={{ borderColor: `${color}40` }}>
                                            <div className="relative">
                                                <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full ring-4 ring-black" style={{ backgroundColor: color }}></div>
                                                <p className="text-gray-300 text-xs line-clamp-1" title={trip.origin || 'Sin origen'}>{trip.origin || 'Ubicación de origen pendiente'}</p>
                                            </div>
                                            {trip.stops && trip.stops.length > 0 && trip.stops.map((stop, idx) => (
                                                <div key={idx} className="relative">
                                                    <div className="absolute -left-[19px] top-0 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-white text-[8px] font-black ring-2 ring-black">{idx + 1}</div>
                                                    <p className="text-orange-300 text-xs line-clamp-1" title={stop.address}>{stop.address}</p>
                                                </div>
                                            ))}
                                            <div className="relative">
                                                <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full ring-4 ring-black" style={{ backgroundColor: color }}></div>
                                                <p className="text-gray-300 text-xs line-clamp-1" title={trip.destination || 'Sin destino'}>{trip.destination || 'Ubicación de destino pendiente'}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                                            <p className="text-white font-mono font-bold text-sm">
                                                {trip.cost > 0 ? `$${(trip.cost + (trip.tollCost || 0)).toFixed(2)}` : 'Por cotizar'}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                {/* Edit Button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const biz = businesses.find(b => b.id === trip.businessId);
                                                        const rate = biz?.waitRatePerMin || 0;
                                                        setEditWaitRate(rate);
                                                        setEditingTripId(trip.id);
                                                        setEditTripFields({ 
                                                            clientName: trip.clientName || '', 
                                                            driverId: trip.driverId || '', 
                                                            waitTimeMinutes: trip.waitTimeMinutes || 0, 
                                                            waitTimeCost: trip.waitTimeCost || 0, 
                                                            cost: trip.cost || 0,
                                                            scheduledAt: trip.scheduledAt ? new Date(new Date(trip.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
                                                        });
                                                    }}
                                                    className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                                    title="Editar Entrega"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">edit</span>
                                                </button>
                                                {trip.status !== 'Completado' && trip.status !== 'Cancelado' && (
                                                    <button
                                                        onClick={(e) => handleCopyClientLinkSidebar(trip, e)}
                                                        className={`text-xs px-2 py-1.5 rounded-lg transition-all flex items-center gap-1 ${copiedClientTripId === trip.id
                                                            ? 'bg-blue-500/20 text-blue-400'
                                                            : 'bg-white/10 hover:bg-white/20 text-white'
                                                            }`}
                                                        title="Copiar Link Cliente"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">
                                                            {copiedClientTripId === trip.id ? 'check' : 'link'}
                                                        </span>
                                                        {copiedClientTripId === trip.id ? '¡Copiado!' : 'Cliente'}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => handleCopyTrip(trip, e)}
                                                    className={`text-xs px-2 py-1.5 rounded-lg transition-all flex items-center gap-1 ${copiedTripId === trip.id
                                                        ? 'bg-green-500/20 text-green-400'
                                                        : 'bg-white/10 hover:bg-white/20 text-white'
                                                        }`}
                                                    title="Copiar despacho"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">
                                                        {copiedTripId === trip.id ? 'check' : 'content_copy'}
                                                    </span>
                                                    {copiedTripId === trip.id ? '¡Copiado!' : 'Repartidor'}
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); window.location.href = `#/tracking/${trip.id}`; }}
                                                    className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">map</span>
                                                    Mapa
                                                </button>
                                            </div>
                                        </div>

                                        {/* Inline Edit Panel */}
                                        {editingTripId === trip.id && (
                                            <div className="mt-3 rounded-xl overflow-hidden border border-indigo-500/40 shadow-lg">
                                                {/* Header */}
                                                <div className="px-3 py-2 bg-indigo-600/30 flex items-center gap-2 border-b border-indigo-500/30">
                                                    <span className="material-symbols-outlined text-indigo-300 text-[15px]">edit_note</span>
                                                    <p className="text-[11px] font-black text-indigo-200 uppercase tracking-widest">Editar Datos de Entrega</p>
                                                </div>
                                                {/* Body */}
                                                <div className="bg-[#1a1a2e] p-3 space-y-3">
                                                    {/* Cliente */}
                                                    <div>
                                                        <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">Nombre del Cliente</label>
                                                        <input
                                                            type="text"
                                                            className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder-white/30"
                                                            value={editTripFields.clientName}
                                                            onChange={(e) => setEditTripFields(p => ({ ...p, clientName: e.target.value }))}
                                                            placeholder="Nombre del cliente..."
                                                        />
                                                    </div>
                                                    {/* Fecha y Hora de Programación */}
                                                    <div>
                                                        <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">Programación de la Entrega (Opcional)</label>
                                                        <input
                                                            type="datetime-local"
                                                            className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                                            value={editTripFields.scheduledAt || ''}
                                                            onChange={(e) => setEditTripFields(p => ({ ...p, scheduledAt: e.target.value }))}
                                                        />
                                                    </div>
                                                    {/* Repartidor — dropdown por ID para re-asignación real */}
                                                    <div>
                                                        <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">Repartidor</label>
                                                        <select
                                                            className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-400 appearance-none cursor-pointer"
                                                            value={editTripFields.driverId}
                                                            onChange={(e) => setEditTripFields(p => ({ ...p, driverId: e.target.value }))}
                                                        >
                                                            <option value="" className="bg-[#1a1a2e] text-gray-400">— Sin asignar —</option>
                                                            {drivers.map(d => (
                                                                <option key={d.id} value={d.id} className="bg-[#1a1a2e] text-white">
                                                                    {d.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    {/* Espera + Costo Espera */}
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">Espera (min)</label>
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                                                value={editTripFields.waitTimeMinutes}
                                                                onChange={(e) => {
                                                                    const mins = parseFloat(e.target.value) || 0;
                                                                    const waitCost = calcWaitCost(mins, editWaitRate);
                                                                    const prevWait = editTripFields.waitTimeCost;
                                                                    const newCost = parseFloat((editTripFields.cost - prevWait + waitCost).toFixed(2));
                                                                    setEditTripFields(p => ({ ...p, waitTimeMinutes: mins, waitTimeCost: waitCost, cost: newCost }));
                                                                }}
                                                                min="0"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">
                                                                Costo Espera
                                                                {editWaitRate > 0 && <span className="ml-1 text-indigo-400/70 normal-case font-normal text-[9px]">(${editWaitRate}/min &gt;20min)</span>}
                                                            </label>
                                                            <div className="w-full bg-indigo-900/40 border border-indigo-500/40 rounded-lg px-3 py-2 text-sm text-indigo-200 font-bold font-mono flex items-center gap-1">
                                                                <span className="text-indigo-400">$</span>
                                                                {editTripFields.waitTimeCost.toFixed(2)}
                                                                {editWaitRate === 0 && <span className="text-white/30 font-normal text-[10px] ml-1">auto</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Costo total — solo lectura, no editable */}
                                                    <div>
                                                        <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">Costo Total ($)</label>
                                                        <div className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-bold font-mono opacity-60 cursor-not-allowed select-none">
                                                            ${editTripFields.cost.toFixed(2)}
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Footer buttons */}
                                                <div className="flex gap-2 px-3 py-2.5 bg-black/30 border-t border-white/5">
                                                    <button
                                                        disabled={savingEdit}
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            setSavingEdit(true);
                                                            const ok = await updateTrip({
                                                                id: trip.id,
                                                                clientName: editTripFields.clientName,
                                                                // Re-assign to selected driver ID (handles change from old to new driver)
                                                                driverId: editTripFields.driverId || undefined,
                                                                waitTimeMinutes: editTripFields.waitTimeMinutes,
                                                                waitTimeCost: editTripFields.waitTimeCost,
                                                                cost: editTripFields.cost,
                                                                scheduledAt: editTripFields.scheduledAt ? new Date(editTripFields.scheduledAt).toISOString() : null as any
                                                            });
                                                            if (ok) {
                                                                const newDriverName = drivers.find(d => d.id === editTripFields.driverId)?.name || trip.driver;
                                                                const sAt = editTripFields.scheduledAt ? new Date(editTripFields.scheduledAt).toISOString() : (editTripFields.scheduledAt === '' ? undefined : trip.scheduledAt);
                                                                setActiveTrips(prev => prev.map(t => t.id === trip.id ? { ...t, clientName: editTripFields.clientName, driver: newDriverName, driverId: editTripFields.driverId || t.driverId, waitTimeMinutes: editTripFields.waitTimeMinutes, waitTimeCost: editTripFields.waitTimeCost, cost: editTripFields.cost, scheduledAt: sAt } : t));
                                                                setEditingTripId(null);
                                                            } else {
                                                                alert('Error al guardar cambios.');
                                                            }
                                                            setSavingEdit(false);
                                                        }}
                                                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">save</span>
                                                        {savingEdit ? 'Guardando...' : 'Guardar'}
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingTripId(null); }}
                                                        className="py-2 px-4 bg-white/10 hover:bg-white/20 text-white/70 text-xs font-bold rounded-lg transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Registro de Casetas */}
                                        {trip.status === 'En Progreso' && (
                                            <div className="mt-3 p-2 bg-indigo-500/5 rounded-lg border border-indigo-500/20 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                                                <label className="text-[10px] font-black text-indigo-400/70 uppercase tracking-widest flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[16px]">toll</span>
                                                    Casetas / Peajes
                                                </label>
                                                <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-md border border-white/5">
                                                    <span className="text-indigo-400/50 text-[10px] font-bold">$</span>
                                                    <input 
                                                        type="number"
                                                        className="w-16 bg-transparent border-none p-0 text-xs text-white focus:outline-none font-mono font-bold"
                                                        defaultValue={trip.tollCost || 0}
                                                        placeholder="0.00"
                                                        onBlur={async (e) => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            if (val !== trip.tollCost) {
                                                                const ok = await updateTrip({ id: trip.id, tollCost: val });
                                                                if (ok) {
                                                                    setActiveTrips(prev => prev.map(t => t.id === trip.id ? { ...t, tollCost: val } : t));
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* ─── BOTONES DE ACCIÓN ─────────────────────────────────────────
                                            Orden: Cancelar | Repartidor en Sitio | Iniciar Entrega | Finalizar Entrega
                                            Cada botón desaparece al presionarse.
                                        */}
                                        <div className="flex gap-2 mt-3 flex-wrap">
                                            {/* CANCELAR — siempre visible mientras no esté finalizado/cancelado */}
                                            {(trip.status !== 'Completado' && trip.status !== 'Cancelado') && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!confirm('¿Cancelar esta entrega?')) return;
                                                        const ok = await updateTripStatus(trip.id, 'Cancelado');
                                                        if (ok) setActiveTrips(prev => prev.filter(t => t.id !== trip.id));
                                                        else alert('Error al cancelar la entrega.');
                                                    }}
                                                    className="flex-1 min-w-[100px] py-2 rounded-lg bg-red-600/20 border border-red-500/30 text-red-500 hover:text-red-400 text-xs font-bold uppercase tracking-wider hover:bg-red-600/40 transition-all flex items-center justify-center gap-1.5"
                                                    title="Cancelar Entrega"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">cancel</span>
                                                    Cancelar
                                                </button>
                                            )}
                                            {/* REPARTIDOR EN SITIO — visible hasta que el repartidor llegue */}
                                            {((trip.status === 'Programado' || trip.status === 'En Progreso') && !trip.driverArrivedAt) && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const now = new Date().toISOString();
                                                        const update: any = { id: trip.id, driverArrivedAt: now };
                                                        if (trip.status === 'Programado') update.status = 'En Progreso';
                                                        const ok = await updateTrip(update);
                                                        if (ok) setActiveTrips(prev => prev.map(t => t.id === trip.id ? { ...t, driverArrivedAt: now, status: update.status || t.status } : t));
                                                    }}
                                                    className="flex-1 min-w-[100px] py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 hover:text-indigo-300 text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-600/40 transition-all flex items-center justify-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">airport_shuttle</span>
                                                    Repartidor en Sitio
                                                </button>
                                            )}
                                            {/* INICIAR ENTREGA — visible después de Repartidor en Sitio */}
                                            {((trip.status === 'Programado' || trip.status === 'En Progreso') && trip.driverArrivedAt && !trip.tripStartedAt) && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const startedAt = new Date();
                                                        const arrivedAt = new Date(trip.driverArrivedAt!);
                                                        const scheduledAt = new Date(trip.scheduledAt || trip.driverArrivedAt!);
                                                        const maxStart = new Date(Math.max(arrivedAt.getTime(), scheduledAt.getTime()));
                                                        let waitMins = Math.floor((startedAt.getTime() - maxStart.getTime()) / 60000);
                                                        if (waitMins < 0) waitMins = 0;
                                                        let waitCost = 0;
                                                        if (waitMins > 20 && trip.businessId) {
                                                            const business = businesses.find(b => b.id === trip.businessId);
                                                            if (business && business.waitRatePerMin) {
                                                                waitCost = (waitMins - 20) * business.waitRatePerMin;
                                                            }
                                                        }
                                                        const ok = await updateTrip({ id: trip.id, tripStartedAt: startedAt.toISOString(), status: 'En Progreso', waitTimeMinutes: waitMins, waitTimeCost: waitCost });
                                                        if (ok) {
                                                            setActiveTrips(prev => prev.map(t => t.id === trip.id ? { ...t, tripStartedAt: startedAt.toISOString(), status: 'En Progreso', waitTimeMinutes: waitMins, waitTimeCost: waitCost } : t));
                                                        }
                                                    }}
                                                    className="flex-1 min-w-[100px] py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 hover:text-cyan-300 text-[10px] font-bold uppercase tracking-wider hover:bg-cyan-600/40 transition-all flex items-center justify-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                                                    Iniciar Entrega
                                                </button>
                                            )}
                                            {/* FINALIZAR ENTREGA — visible solo cuando la entrega ya inició */}
                                            {(trip.status === 'En Progreso' && trip.tripStartedAt) && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const card = (e.currentTarget as HTMLElement).closest('.group');
                                                        const tollInput = card?.querySelector('input[type="number"]') as HTMLInputElement | null;
                                                        const currentTollCost = tollInput ? (parseFloat(tollInput.value) || 0) : (trip.tollCost || 0);
                                                        const ok = await updateTrip({ id: trip.id, status: 'Completado', tollCost: currentTollCost });
                                                        if (ok) {
                                                            setActiveTrips(prev => prev.filter(t => t.id !== trip.id));
                                                            showToast('Entrega finalizada', 'success');
                                                        } else {
                                                            showToast('Error al finalizar la entrega', 'error');
                                                        }
                                                    }}
                                                    className="flex-1 min-w-[100px] py-2 rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 hover:text-green-300 text-xs font-bold uppercase tracking-wider hover:bg-green-600/40 transition-all flex items-center justify-center gap-1.5"
                                                    title="Finalizar Entrega"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                    Finalizar Entrega
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>
    );
};

export default DispatchSidebar;
