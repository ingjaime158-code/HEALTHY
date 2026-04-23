import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTripsPaginated, Trip, initializeData, updateTripStatus, deleteTrip, deleteTripsBulk, getPricingSettings, PricingSettings, updateTripPaymentStatus, updateTrip, getBusinesses, Business } from '../services/dataService';
import PaymentTicket from '../components/PaymentTicket';
import { supabase } from '../services/supabaseClient';
import { formatCurrency } from '../utils/format';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const TripManagement = () => {
    const navigate = useNavigate();
    const { tripId } = useParams();
    const [trips, setTrips] = useState<Trip[]>([]);
    const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
    const [pricing, setPricing] = useState<PricingSettings | null>(null);
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [copiedClientId, setCopiedClientId] = useState<string | null>(null);
    const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set());
    const [ticketTrip, setTicketTrip] = useState<Trip | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalTrips, setTotalTrips] = useState(0);
    const [activeTotal, setActiveTotal] = useState(0); // Nuevo: Total real en DB
    const [historyTotal, setHistoryTotal] = useState(0); // Nuevo: Total real en DB
    const PAGE_SIZE = 50;

    // Edit trip modal state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editFields, setEditFields] = useState<{ passengerName: string; driver: string; waitTimeMinutes: number; waitTimeCost: number; cost: number }>({ passengerName: '', driver: '', waitTimeMinutes: 0, waitTimeCost: 0, cost: 0 });
    const [editWaitRate, setEditWaitRate] = useState<number>(0); // waitRatePerMin del cliente comercial
    const [savingEditModal, setSavingEditModal] = useState(false);

    // Helper: calcula costo de espera (aplica a partir del min 21)
    const calcWaitCost = (minutes: number, ratePerMin: number): number => {
        if (minutes <= 20 || ratePerMin <= 0) return 0;
        return parseFloat(((minutes - 20) * ratePerMin).toFixed(2));
    };

    useEffect(() => {
        loadTrips();
        getBusinesses().then(setBusinesses);
    }, []);

    const loadTrips = async (page = currentPage) => {
        initializeData();
        const [paginatedResult, pricingData] = await Promise.all([
            getTripsPaginated(page, PAGE_SIZE),
            getPricingSettings()
        ]);
        
        // Obtener conteos totales reales para las insignias
        const { count: activeCount } = await supabase.from('trips').select('id', { count: 'exact', head: true }).in('status', ['En Progreso', 'Pendiente de Confirmación', 'Programado']);
        const { count: historyCount } = await supabase.from('trips').select('id', { count: 'exact', head: true }).not('status', 'in', '("En Progreso", "Pendiente de Confirmación", "Programado")');
        
        setTrips(paginatedResult.data);
        setTotalTrips(paginatedResult.total);
        setActiveTotal(activeCount || 0);
        setHistoryTotal(historyCount || 0);
        setPricing(pricingData);
        setLoading(false);
    };
    
    // NOTA: Para que lo anterior funcione sin importar supabaseClient directamente, 
    // usualmente se exporta supabase de ../supabaseClient.
    // Revisemos si necesito importar supabase.

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        setLoading(true);
        loadTrips(newPage);
    };

    const totalPages = Math.ceil(totalTrips / PAGE_SIZE);

    // Sync URL with Selection
    useEffect(() => {
        if (loading) return;

        if (tripId) {
            const found = trips.find(t => t.id === tripId);
            if (found) {
                setSelectedTrip(found);
            }
        } else {
            setSelectedTrip(null);
        }
    }, [tripId, loading, trips]);



    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Completado': return 'bg-green-100 text-green-800';
            case 'En Progreso': return 'bg-blue-100 text-blue-800';
            case 'Programado': return 'bg-yellow-100 text-yellow-800'; // Nuevo
            case 'Cancelado': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const handleCopyTrip = async (trip: Trip, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();

        const originMapLink = trip.originLat && trip.originLng
            ? `https://www.google.com/maps?q=${trip.originLat},${trip.originLng}`
            : '';
        const destMapLink = trip.destLat && trip.destLng
            ? `https://www.google.com/maps?q=${trip.destLat},${trip.destLng}`
            : '';

        const lines = [
            ...(trip.scheduledAt ? [
                `🕒 *PROGRAMADO:*`,
                `   ${new Date(trip.scheduledAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}`,
                ``
            ] : []),
            `👤 *REPARTIDOR:*`,
            `   ${trip.driver && trip.driver !== 'Unknown' ? trip.driver : 'No asignado'}`,
            ``,
            `📍 *ORIGEN:*`,
            `   ${trip.origin || 'No especificado'}`,
            originMapLink ? `   🗺️ ${originMapLink}` : '',
            ``,
            ...(trip.stops && trip.stops.length > 0 ? trip.stops.flatMap((stop, idx) => [
                `📌 *PARADA ${idx + 1}:*`,
                `   ${stop.address}`,
                `   🗺️ https://www.google.com/maps?q=${stop.lat},${stop.lng}`,
                ``
            ]) : []),
            `🏁 *DESTINO${trip.stops && trip.stops.length > 0 ? ' FINAL' : ''}:*`,
            `   ${trip.destination || 'No especificado'}`,
            destMapLink ? `   🗺️ ${destMapLink}` : ''
        ].filter(Boolean).join('\n');

        try {
            await navigator.clipboard.writeText(lines);
            setCopiedId(trip.id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = lines;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopiedId(trip.id);
            setTimeout(() => setCopiedId(null), 2000);
        }
    };

    const handleCopyClientLink = async (trip: Trip, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();



        const confirmLink = `${window.location.origin}${window.location.pathname}#/confirmacion/${trip.id}`;

        const lines = [
            `Hola ${trip.passengerName || ''},`,
            `El costo de tu entrega es de ${formatCurrency(trip.cost)}.`,
            ``,
            `Por favor, confirma el costo en el siguiente enlace para proceder con el servicio:`,
            confirmLink
        ].join('\n');

        try {
            await navigator.clipboard.writeText(lines);
            setCopiedClientId(trip.id);
            setTimeout(() => setCopiedClientId(null), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = lines;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopiedClientId(trip.id);
            setTimeout(() => setCopiedClientId(null), 2000);
        }
    };

    const handleDeleteTrip = async () => {
        if (!selectedTrip) return;
        if (window.confirm('¿Estás seguro de que deseas eliminar esta entrega? Esta acción no se puede deshacer.')) {
            const result = await deleteTrip(selectedTrip.id);
            if (result.success) {
                // Forzar recarga completa para asegurar sincronía con totales
                setSelectedTrip(null);
                loadTrips(currentPage);
                navigate('/trips');
            } else {
                alert(result.error || 'Hubo un error al eliminar la entrega.');
            }
        }
    };

    const handleDeleteBulk = async () => {
        if (selectedTripIds.size === 0) return;
        if (window.confirm(`¿Estás seguro de que deseas eliminar ${selectedTripIds.size} entregas seleccionadas? Esta acción no se puede deshacer.`)) {
            const idsToDelete = Array.from(selectedTripIds) as string[];
            const result = await deleteTripsBulk(idsToDelete);
            if (result.success) {
                setSelectedTripIds(new Set());
                loadTrips(currentPage);
                if (selectedTrip && selectedTripIds.has(selectedTrip.id)) {
                    setSelectedTrip(null);
                    navigate('/trips');
                }
            } else {
                alert(result.error || 'Hubo un error al eliminar las entregas.');
            }
        }
    };

    const toggleSelectAll = () => {
        if (selectedTripIds.size === filteredTrips.length && filteredTrips.length > 0) {
            setSelectedTripIds(new Set());
        } else {
            setSelectedTripIds(new Set(filteredTrips.map(t => t.id)));
        }
    };

    const toggleSelectTrip = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSelected = new Set(selectedTripIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedTripIds(newSelected);
    };

    const handleExportCSV = () => {
        const data = filteredTrips;
        if (data.length === 0) {
            alert('No hay datos para exportar.');
            return;
        }

        const headers = ['ID Entrega', 'Fecha', 'Hora', 'Cliente', 'Repartidor', 'Vehículo', 'Origen', 'Destino', 'Destinatario', 'Teléfono', 'Estado', 'Costo', 'Operador'];

        const rows = data.map(t => [
            t.id, t.date, t.time, t.client, t.driver, t.plate,
            t.origin, t.destination, t.passengerName || '', t.passengerPhone || '',
            t.status, t.cost, t.createdBy || 'Sistema'
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(item => `"${String(item).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_entregas_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadScheduledPDF = async () => {
        const { data, error } = await supabase
            .from('trips')
            .select('*, driver:drivers(name), unit:fleet_units(name)')
            .eq('status', 'Programado')
            .order('scheduled_at', { ascending: true });

        if (error || !data || data.length === 0) {
            alert('No hay entregas programadas para descargar.');
            return;
        }

        // Agrupar por día
        const grouped: Record<string, any[]> = {};
        for (const trip of data) {
            const dateStr = trip.scheduled_at
                ? new Date(trip.scheduled_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
                : 'Sin Fecha';
            if (!grouped[dateStr]) grouped[dateStr] = [];
            grouped[dateStr].push(trip);
        }

        const doc = new jsPDF('landscape');
        
        doc.setFillColor(17, 17, 17);
        doc.rect(0, 0, 300, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('REPORTE DE ENTREGAS PROGRAMADAS - HEALTHY DREAM', 14, 13);

        let startY = 30;

        for (const [dateStr, tripsForDay] of Object.entries(grouped)) {
            doc.setFontSize(12);
            doc.setTextColor(30, 30, 30);
            doc.text(`Fecha: ${dateStr.toUpperCase()}`, 14, startY);

            const tableData = tripsForDay.map(t => {
                const timeStr = t.scheduled_at ? new Date(t.scheduled_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
                return [
                    timeStr,
                    t.passenger_name || 'Desconocido',
                    t.driver?.name || t.unit?.name || 'No Asignado',
                    t.origin || '',
                    t.destination || ''
                ];
            });

            autoTable(doc, {
                startY: startY + 5,
                head: [['Hora', 'Destinatario', 'Repartidor', 'Origen', 'Destino']],
                body: tableData,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
                columnStyles: {
                    0: { cellWidth: 20 },
                    1: { cellWidth: 40 },
                    2: { cellWidth: 40 },
                    3: { cellWidth: 80 },
                    4: { cellWidth: 80 }
                }
            });

            startY = (doc as any).lastAutoTable.finalY + 15;
            if (startY > 180) {
                doc.addPage();
                startY = 20;
            }
        }

        doc.save(`Entregas_Programadas_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const activeTrips = trips.filter(t => t.status === 'En Progreso' || t.status === 'Pendiente de Confirmación' || t.status === 'Programado');
    const historyTrips = trips.filter(t => t.status !== 'En Progreso' && t.status !== 'Pendiente de Confirmación' && t.status !== 'Programado');

    // Filtro de Búsqueda
    const applySearch = (tripList: Trip[]) => {
        if (!searchTerm) return tripList;
        const lowerTerm = searchTerm.toLowerCase();
        return tripList.filter(t =>
            t.passengerName?.toLowerCase().includes(lowerTerm) ||
            t.origin?.toLowerCase().includes(lowerTerm) ||
            t.destination?.toLowerCase().includes(lowerTerm) ||
            t.unitName?.toLowerCase().includes(lowerTerm) ||
            t.id.toLowerCase().includes(lowerTerm)
        );
    };

    const filteredActiveTrips = applySearch(activeTrips);
    const filteredHistoryTrips = applySearch(historyTrips);

    const filteredTrips = activeTab === 'active' ? filteredActiveTrips : filteredHistoryTrips;

    return (
        <div className="flex-1 overflow-hidden flex flex-col h-full bg-background-light">
            <header className="sticky top-0 z-10 bg-background-light/95 px-8 py-6 border-b border-gray-200 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-[#111118] text-3xl font-extrabold leading-tight tracking-tight">Gestión de Entregas</h2>
                    <p className="text-[#636388] text-sm font-medium">Monitorea las entregas, rastrea rutas y gestiona pedidos.</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                        <input
                            type="text"
                            placeholder="Buscar destinatario, origen, destino..."
                            className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-[280px]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {selectedTripIds.size > 0 && (
                        <button
                            onClick={handleDeleteBulk}
                            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors shadow-sm"
                        >
                            <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                            Eliminar ({selectedTripIds.size})
                        </button>
                    )}
                    <button
                        onClick={handleDownloadScheduledPDF}
                        className="flex items-center gap-2 px-4 py-2.5 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm font-bold hover:bg-yellow-100 transition-colors shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">event_note</span> Programados (PDF)
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">download</span> Exportar CSV
                    </button>
                </div>
            </header>

            <div className="flex-1 flex flex-row min-h-0">
                <div className="flex-1 min-w-0 flex flex-col p-8 overflow-y-auto">
                    <div className="flex items-center gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
                        <button
                            onClick={() => setActiveTab('active')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'active'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            Activas
                            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-bold">{activeTotal || activeTrips.length}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'history'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <span className="material-symbols-outlined text-[16px]">history</span>
                            Historial
                            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-600 font-bold">{historyTotal || historyTrips.length}</span>
                        </button>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-200">

                                    {(activeTab === 'active' || activeTab === 'history') && (
                                        <tr>
                                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-16">
                                                <input
                                                    className="rounded border-slate-300 text-primary cursor-pointer"
                                                    type="checkbox"
                                                    checked={filteredTrips.length > 0 && selectedTripIds.size === filteredTrips.length}
                                                    onChange={toggleSelectAll}
                                                />
                                            </th>
                                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">ID Entrega</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha y Hora</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Programado</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Usuario</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Destinatario</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">REPARTIDOR</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KM</th>
                                            <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Costo</th>
                                            {activeTab === 'active' && (
                                                <>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estado</th>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-16">Repartidor</th>
                                                </>
                                            )}
                                            {activeTab === 'history' && (
                                                <>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estado Entrega</th>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estado Pago</th>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Ticket</th>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estatus</th>
                                                </>
                                            )}
                                        </tr>
                                    )}
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <tr><td colSpan={8} className="p-8 text-center text-slate-400">Cargando datos del servidor...</td></tr>
                                    ) : (
                                        <>

                                            {(activeTab === 'active' || activeTab === 'history') && (
                                                filteredTrips.map((trip) => (
                                                    <tr
                                                        key={trip.id}
                                                        onClick={() => navigate(`/trips/${trip.id}`)}
                                                        className={`group cursor-pointer transition-colors border-l-4 ${selectedTrip?.id === trip.id ? 'bg-blue-50/50 border-l-primary' : 'hover:bg-slate-50 border-l-transparent'}`}
                                                    >
                                                        <td className="p-4 w-16 align-middle">
                                                            <input
                                                                className="rounded border-slate-300 text-primary cursor-pointer"
                                                                type="checkbox"
                                                                checked={selectedTripIds.has(trip.id)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onChange={(e) => toggleSelectTrip(trip.id, e as any)}
                                                            />
                                                        </td>
                                                        <td className="p-4 align-middle"><span className="text-sm font-medium text-slate-900 font-mono">{trip.id.substring(0, 8)}...</span></td>
                                                        <td className="p-4 align-middle"><div className="flex flex-col"><span className="text-sm text-slate-900 font-medium">{trip.date}</span><span className="text-xs text-slate-500">{trip.time}</span></div></td>
                                                        <td className="p-4 align-middle"><span className="text-sm text-slate-500 font-medium">{trip.scheduledAt ? new Date(trip.scheduledAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'n/a'}</span></td>
                                                        <td className="p-4 align-middle"><span className="text-sm font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{trip.createdBy || 'Sistema'}</span></td>
                                                        <td className="p-4 align-middle">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                                                                    {(trip.passengerName || 'P').charAt(0).toUpperCase()}
                                                                </div>
                                                                <span className="text-sm font-medium text-slate-700 truncate max-w-[120px]">{trip.passengerName || 'General'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 align-middle">
                                                            <div className="flex flex-col gap-0.5 items-start">
                                                                <span className="text-sm text-slate-700 font-bold">{trip.driver && trip.driver !== 'Unknown' ? trip.driver : 'Repartidor No Asignado'}</span>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-xs text-slate-400 font-medium">{trip.unitName || 'Sin Base'}</span>
                                                                    {trip.isOwnUnit && <span className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Propia</span>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 align-middle"><span className="text-sm font-medium text-slate-700">{trip.distanceKm ? trip.distanceKm.toFixed(1) + ' km' : '0.0 km'}</span></td>
                                                        <td className="p-4 align-middle text-right"><span className="text-sm font-bold text-slate-900">{formatCurrency(trip.cost)}</span></td>
                                                        <td className="p-4 align-middle text-center">
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusStyle(trip.status)}`}>
                                                                {trip.status}
                                                            </span>
                                                        </td>
                                                        {activeTab === 'active' && (
                                                            <td className="p-4 align-middle text-center">
                                                                <button
                                                                    onClick={(e) => handleCopyTrip(trip, e)}
                                                                    className={`p-2 rounded-lg transition-all ${copiedId === trip.id
                                                                        ? 'bg-green-100 text-green-600 shadow-inner'
                                                                        : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
                                                                        }`}
                                                                    title="Copiar despacho"
                                                                >
                                                                    <span className="material-symbols-outlined text-[18px]">
                                                                        {copiedId === trip.id ? 'check_circle' : 'content_copy'}
                                                                    </span>
                                                                </button>
                                                            </td>
                                                        )}
                                                        {activeTab === 'history' && (
                                                            <>
                                                                <td className="p-4 text-center align-middle">
                                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${trip.paymentStatus === 'Pagado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                        {trip.paymentStatus || 'Pendiente'}
                                                                    </span>
                                                                </td>
                                                                <td className="p-4 text-center align-middle">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setTicketTrip(trip); }}
                                                                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 transition-colors"
                                                                        title="Ver Comprobante"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                                                                    </button>
                                                                </td>
                                                                <td className="p-4 text-center align-middle">
                                                                    <button
                                                                        disabled={updatingPaymentId === trip.id}
                                                                        onClick={async (e) => {
                                                                            e.stopPropagation();
                                                                            setUpdatingPaymentId(trip.id);
                                                                            const newStatus = trip.paymentStatus === 'Pagado' ? 'Pendiente' : 'Pagado';
                                                                            if (await updateTripPaymentStatus(trip.id, newStatus)) {
                                                                                const updatedTrips = trips.map(t => t.id === trip.id ? { ...t, paymentStatus: newStatus } : t);
                                                                                setTrips(updatedTrips);
                                                                            }
                                                                            setUpdatingPaymentId(null);
                                                                        }}
                                                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1 ${trip.paymentStatus === 'Pagado' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                                                    >
                                                                        {updatingPaymentId === trip.id ? '...' : (
                                                                            trip.paymentStatus === 'Pagado' ? (
                                                                                <>
                                                                                    <span className="material-symbols-outlined text-[14px]">undo</span> Deshacer
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <span className="material-symbols-outlined text-[14px]">payments</span> Cobrar
                                                                                </>
                                                                            )
                                                                        )}
                                                                    </button>
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                ))
                                            )}
                                            {filteredTrips.length === 0 && (
                                                <tr>
                                                    <td colSpan={activeTab === 'history' ? 12 : 11} className="p-12 text-center">
                                                        <span className="material-symbols-outlined text-[48px] text-slate-200 mb-2 block">
                                                            {activeTab === 'active' ? 'hourglass_empty' : 'inventory_2'}
                                                        </span>
                                                        <p className="text-slate-400 text-sm font-medium">
                                                            {activeTab === 'active'
                                                                ? 'No hay entregas activas ni pendientes de confirmación en este momento.'
                                                                : 'No hay entregas en el historial.'
                                                            }
                                                        </p>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
                                <p className="text-sm text-slate-500">
                                    Mostrando <span className="font-bold">{((currentPage - 1) * PAGE_SIZE) + 1}</span> a <span className="font-bold">{Math.min(currentPage * PAGE_SIZE, totalTrips)}</span> de <span className="font-bold">{totalTrips}</span> entregas
                                </p>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handlePageChange(1)}
                                        disabled={currentPage === 1}
                                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">first_page</span>
                                    </button>
                                    <button
                                        onClick={() => handlePageChange(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                                    </button>
                                    <span className="px-3 py-1 text-sm font-bold text-slate-700">
                                        {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => handlePageChange(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                                    </button>
                                    <button
                                        onClick={() => handlePageChange(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">last_page</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Details Sidebar (inline, no overlay) */}
                {selectedTrip && (
                    <div className="w-[420px] shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-y-auto">
                        <div className="flex items-center justify-between p-6 bg-slate-50 border-b border-slate-200">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Detalles de la Entrega</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600 uppercase tracking-tighter">{selectedTrip.id.substring(0, 13)}</span>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusStyle(selectedTrip.status)}`}>{selectedTrip.status}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        const biz = businesses.find(b => b.id === selectedTrip.businessId);
                                        const rate = biz?.waitRatePerMin || 0;
                                        setEditWaitRate(rate);
                                        setEditFields({ passengerName: selectedTrip.passengerName || '', driver: selectedTrip.driver !== 'Unknown' ? (selectedTrip.driver || '') : '', waitTimeMinutes: selectedTrip.waitTimeMinutes || 0, waitTimeCost: selectedTrip.waitTimeCost || 0, cost: selectedTrip.cost || 0 });
                                        setEditModalOpen(true);
                                    }}
                                    className="p-2 hover:bg-indigo-50 rounded-full text-indigo-400 hover:text-indigo-600 transition-colors"
                                    title="Editar Datos"
                                >
                                    <span className="material-symbols-outlined">edit_note</span>
                                </button>
                                <button
                                    onClick={() => handleCopyClientLink(selectedTrip)}
                                    className={`p-2 rounded-full transition-colors flex items-center gap-1 text-xs font-bold ${copiedClientId === selectedTrip.id
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'bg-white hover:bg-slate-200 text-slate-500 border border-slate-200'
                                        }`}
                                    title="Copiar Link de Confirmación"
                                >
                                    <span className="material-symbols-outlined text-[18px]">
                                        {copiedClientId === selectedTrip.id ? 'check_circle' : 'link'}
                                    </span>
                                    <span>Cliente</span>
                                </button>
                                <button
                                    onClick={() => handleCopyTrip(selectedTrip)}
                                    className={`p-2 rounded-full transition-colors ${copiedId === selectedTrip.id
                                        ? 'bg-green-100 text-green-600'
                                        : 'hover:bg-slate-200 text-slate-400 hover:text-slate-600'
                                        }`}
                                    title="Copiar despacho"
                                >
                                    <span className="material-symbols-outlined">
                                        {copiedId === selectedTrip.id ? 'check_circle' : 'content_copy'}
                                    </span>
                                </button>
                                <button
                                    onClick={handleDeleteTrip}
                                    className="p-2 hover:bg-red-50 rounded-full text-red-400 hover:text-red-500 transition-colors"
                                    title="Eliminar Entrega"
                                >
                                    <span className="material-symbols-outlined">delete</span>
                                </button>
                                <button
                                    onClick={() => navigate('/trips')}
                                    className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto">
                            <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm relative h-48 bg-slate-100 mb-6 group cursor-pointer" onClick={() => window.open(`#/tracking/${selectedTrip.id}`, '_blank')}>
                                <img
                                    className="w-full h-full object-cover transition-transform group-hover:scale-105 opacity-80"
                                    src={selectedTrip.image || 'https://maps.googleapis.com/maps/api/staticmap?center=Monterrey,NL&zoom=12&size=400x200&key='}
                                    onError={(e) => {
                                        e.currentTarget.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/No_image_available.svg/600px-No_image_available.svg.png';
                                        e.currentTarget.onerror = null;
                                    }}
                                    alt="Route Map"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-4">
                                    <p className="text-white text-xs font-bold flex items-center gap-1 group-hover:underline">
                                        <span className="material-symbols-outlined text-[14px]">map</span> Ver rastreo en vivo
                                    </p>
                                </div>
                            </div>

                            <div className="mb-6 relative">
                                <div className="absolute top-2 bottom-2 left-[15px] w-0.5 bg-slate-200/50"></div>
                                <div className="flex gap-4 mb-4 relative z-10">
                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border-4 border-white shadow-sm">
                                        <span className="material-symbols-outlined text-[16px]">trip_origin</span>
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-0.5">Origen</p>
                                        <p className="text-sm font-bold text-slate-900 break-words leading-snug">{selectedTrip.origin || 'No especificado'}</p>
                                        <p className="text-[10px] font-medium text-slate-400 mt-0.5 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">schedule</span> {selectedTrip.time}
                                        </p>
                                    </div>
                                </div>
                                {selectedTrip.stops && selectedTrip.stops.length > 0 && selectedTrip.stops.map((stop, idx) => (
                                    <div key={idx} className="flex gap-4 mb-4 relative z-10">
                                        <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 border-4 border-white shadow-sm">
                                            <span className="text-[12px] font-black">{idx + 1}</span>
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="text-[10px] text-orange-400 font-extrabold uppercase tracking-widest mb-0.5">Parada {idx + 1}</p>
                                            <p className="text-sm font-bold text-slate-900 break-words leading-snug">{stop.address}</p>
                                        </div>
                                    </div>
                                ))}
                                <div className="flex gap-4 relative z-10">
                                    <div className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0 border-4 border-white shadow-sm">
                                        <span className="material-symbols-outlined text-[16px]">location_on</span>
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-0.5">{selectedTrip.stops && selectedTrip.stops.length > 0 ? 'Destino Final' : 'Destino'}</p>
                                        <p className="text-sm font-bold text-slate-900 break-words leading-snug">{selectedTrip.destination || 'No especificado'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 mb-6">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                                        <span className="material-symbols-outlined">person</span>
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-0.5">Destinatario</p>
                                        <p className="text-sm font-bold text-slate-900 truncate">{selectedTrip.passengerName || 'P. General'}</p>
                                        <p className="text-[10px] font-medium text-blue-600 mt-0.5">{selectedTrip.passengerPhone || 'Sin número'}</p>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold">
                                        <span className="material-symbols-outlined">delivery_dining</span>
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-0.5">Repartidor</p>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-sm font-bold text-slate-900 truncate">{selectedTrip.driver !== 'Unknown' ? selectedTrip.driver : 'Repartidor No Asignado'}</p>
                                            <span className="text-[10px] font-bold bg-white text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">{selectedTrip.plate || '---'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] text-slate-500 font-medium">{selectedTrip.unitName || 'Sin Base'}</span>
                                            {selectedTrip.isOwnUnit && <span className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Propia</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold">
                                        <span className="material-symbols-outlined">admin_panel_settings</span>
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mb-0.5">Operador de Sistema</p>
                                        <p className="text-sm font-bold text-slate-900 truncate">{selectedTrip.createdBy || 'Sistema (Automático)'}</p>
                                    </div>
                                </div>
                            </div>
                            
                            {selectedTrip.status === 'Pendiente de Confirmación' && (
                                <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4">
                                    <h4 className="text-xs font-bold text-orange-800 mb-1 uppercase tracking-wider flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[16px]">warning</span>
                                        Confirmación Requerida
                                    </h4>
                                    <p className="text-[11px] text-orange-700 mb-3 leading-tight">
                                        Esta carrera está pendiente de confirmación. Puedes copiar el enlace para el cliente o confirmarla manualmente.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleCopyClientLink(selectedTrip, e); }}
                                            className="flex-1 py-2 bg-white border border-orange-300 text-orange-700 rounded-lg text-[11px] font-bold hover:bg-orange-100 transition-colors flex items-center justify-center gap-1"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">link</span>
                                            Copiar Link
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (await updateTripStatus(selectedTrip.id, 'En Progreso')) {
                                                    setSelectedTrip({ ...selectedTrip, status: 'En Progreso' });
                                                    setTrips(trips.map(t => t.id === selectedTrip.id ? { ...t, status: 'En Progreso' } : t));
                                                }
                                            }}
                                            className="flex-1 py-2 bg-orange-600 border border-transparent text-white rounded-lg text-[11px] font-bold hover:bg-orange-700 transition-colors flex items-center justify-center gap-1 shadow-sm"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                            Confirmar
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="mb-6">
                                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 block">Actualizar Estado</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['Pendiente de Confirmación', 'En Progreso', 'Completado', 'Cancelado'].map((status) => (
                                        <button
                                            key={status}
                                            onClick={async () => {
                                                if (await updateTripStatus(selectedTrip.id, status)) {
                                                    setSelectedTrip({ ...selectedTrip, status: status as any });
                                                    setTrips(trips.map(t => t.id === selectedTrip.id ? { ...t, status: status as any } : t));
                                                }
                                            }}
                                            className={`py-2 rounded-lg text-[9px] uppercase tracking-tighter font-bold transition-all border flex items-center justify-center text-center leading-tight h-10 ${selectedTrip.status === status
                                                ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                                }`}
                                            title={status}
                                        >
                                            {status === 'Pendiente de Confirmación' ? 'Pdte.' : status}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
                                <div className="absolute -top-4 -right-4 opacity-10">
                                    <span className="material-symbols-outlined text-[120px]">receipt_long</span>
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-xs font-extrabold uppercase tracking-widest flex items-center gap-2 text-slate-400">
                                            <span className="material-symbols-outlined text-[18px]">payments</span>
                                            Desglose de Pago
                                        </h4>
                                        {selectedTrip.paymentStatus && (
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${selectedTrip.paymentStatus === 'Pagado' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {selectedTrip.paymentStatus}
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between items-center text-slate-400">
                                            <span>Tarifa Base</span>
                                            <span className="font-medium">{formatCurrency(selectedTrip.baseFare)}</span>
                                        </div>
                                        {(selectedTrip.distanceKm && selectedTrip.distanceKm > 0) ? (
                                            <div className="flex justify-between items-center text-slate-400">
                                                <span className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[14px]">route</span>
                                                    {selectedTrip.distanceKm.toFixed(1)} km × {formatCurrency(pricing ? pricing.kmRate : (selectedTrip.distanceFare / selectedTrip.distanceKm))}/km
                                                </span>
                                                <span className="font-medium">{formatCurrency(selectedTrip.distanceFare)}</span>
                                            </div>
                                        ) : (
                                            <div className="flex justify-between items-center text-slate-400">
                                                <span>Recorridos</span>
                                                <span className="font-medium">{formatCurrency(selectedTrip.distanceFare)}</span>
                                            </div>
                                        )}
                                        {pricing && (
                                            <div className="flex justify-between items-center text-blue-400 font-bold bg-blue-500/10 px-3 py-2 -mx-3 rounded-lg border border-blue-500/20">
                                                <span className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[14px]">shield</span>
                                                    Ganancia HD {selectedTrip.isOwnUnit ? '(Base Propia)' : `(${pricing.commissionRate}%)`}
                                                </span>
                                                <span>{formatCurrency(selectedTrip.commissionAmount || (selectedTrip.cost * (pricing.commissionRate / 100)))}</span>
                                            </div>
                                        )}
                                        <div className="h-px bg-white/10 my-2"></div>
                                        <div className="flex justify-between items-center font-extrabold text-xl text-white">
                                            <span>Total</span>
                                            <span>{formatCurrency(selectedTrip.cost)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {ticketTrip && pricing && (
                <PaymentTicket
                    trip={ticketTrip}
                    pricing={pricing}
                    onClose={() => setTicketTrip(null)}
                />
            )}

            {/* Edit Trip Modal */}
            {editModalOpen && selectedTrip && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between p-6 bg-slate-50 border-b border-slate-200">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Editar Datos de Carrera</h3>
                                <p className="text-xs text-slate-400 mt-0.5 font-mono">{selectedTrip.id.substring(0, 13)}...</p>
                            </div>
                            <button onClick={() => setEditModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nombre del Cliente / Destinatario</label>
                                <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" value={editFields.passengerName} onChange={(e) => setEditFields(p => ({ ...p, passengerName: e.target.value }))} placeholder="Nombre del cliente..." />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nombre del Repartidor</label>
                                <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" value={editFields.driver} onChange={(e) => setEditFields(p => ({ ...p, driver: e.target.value }))} placeholder="Nombre del repartidor..." />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tiempo de Espera (min)</label>
                                    <input
                                        type="number"
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        value={editFields.waitTimeMinutes}
                                        onChange={(e) => {
                                            const mins = parseFloat(e.target.value) || 0;
                                            const waitCost = calcWaitCost(mins, editWaitRate);
                                            const prevWait = editFields.waitTimeCost;
                                            const newCost = parseFloat((editFields.cost - prevWait + waitCost).toFixed(2));
                                            setEditFields(p => ({ ...p, waitTimeMinutes: mins, waitTimeCost: waitCost, cost: newCost }));
                                        }}
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                        Costo de Espera ($)
                                        {editWaitRate > 0 && <span className="ml-1 text-indigo-500 font-normal normal-case">(${editWaitRate}/min &gt;20min)</span>}
                                    </label>
                                    <div className="w-full border border-indigo-200 bg-indigo-50 rounded-lg px-3 py-2.5 text-sm font-bold text-indigo-700 flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-indigo-400 text-[16px]">calculate</span>
                                        {formatCurrency(editFields.waitTimeCost)}
                                        {editWaitRate === 0 && <span className="text-slate-400 font-normal text-xs">(sin tarifa definida)</span>}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Costo Total ($)</label>
                                <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" value={editFields.cost} onChange={(e) => setEditFields(p => ({ ...p, cost: parseFloat(e.target.value) || 0 }))} min="0" step="0.01" />
                            </div>
                        </div>
                        <div className="flex gap-3 px-6 pb-6">
                            <button
                                disabled={savingEditModal}
                                onClick={async () => {
                                    setSavingEditModal(true);
                                    const ok = await updateTrip({
                                        id: selectedTrip.id,
                                        passengerName: editFields.passengerName,
                                        waitTimeMinutes: editFields.waitTimeMinutes,
                                        waitTimeCost: editFields.waitTimeCost,
                                        cost: editFields.cost
                                    });
                                    if (ok) {
                                        const updated = { ...selectedTrip, passengerName: editFields.passengerName, driver: editFields.driver || selectedTrip.driver, waitTimeMinutes: editFields.waitTimeMinutes, waitTimeCost: editFields.waitTimeCost, cost: editFields.cost };
                                        setSelectedTrip(updated);
                                        setTrips(trips.map(t => t.id === selectedTrip.id ? updated : t));
                                        setEditModalOpen(false);
                                    } else {
                                        alert('Error al guardar cambios. Inténtalo de nuevo.');
                                    }
                                    setSavingEditModal(false);
                                }}
                                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-[18px]">save</span>
                                {savingEditModal ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                            <button
                                onClick={() => setEditModalOpen(false)}
                                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TripManagement;