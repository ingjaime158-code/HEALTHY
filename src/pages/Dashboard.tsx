import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrips, getPricingSettings, initializeData, getBusinesses, getUnits, getDrivers, getTransactions, getLeads, Business, FleetUnit, Driver, CommercialTransaction, Lead, Trip, addTrip, updateTripPaymentStatus } from '../services/dataService';
import jsPDF from 'jspdf';
import { formatCurrency } from '../utils/format';

const Dashboard = () => {
    const navigate = useNavigate();
    const { section } = useParams();

    // VIEW MODE STATE
    const [viewMode, setViewMode] = useState<'logistics' | 'trading' | 'global'>('global');

    // Sync URL param with State
    useEffect(() => {
        if (section === 'logistica') setViewMode('logistics');
        else if (section === 'comercializadora') setViewMode('trading');
        else if (section === 'global') setViewMode('global');
        else setViewMode('global'); // Default
    }, [section]);

    // Stats Logic
    const [totalRevenue, setTotalRevenue] = useState(0);
    // ... (other simple states)
    const [rateInput, setRateInput] = useState(15.0);
    const [notification, setNotification] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
    const [loading, setLoading] = useState(true);

    const [allData, setAllData] = useState<{ businesses: Business[], units: FleetUnit[], drivers: Driver[] }>({
        businesses: [], units: [], drivers: []
    });

    const [allTrips, setAllTrips] = useState<Trip[]>([]);


    // New State for Real Lists
    const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
    const [recentTrips, setRecentTrips] = useState<any[]>([]);

    // Filters
    const [filters, setFilters] = useState({ businessId: '', unitId: '', driverId: '', productCategory: '' });

    // Time Filter
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '3m' | '6m' | '1y' | 'this_month' | 'last_month'>('30d');

    // Stats for Cards
    const [stats, setStats] = useState({
        // Logistics
        logisticsRevenue: 0,
        tripsCount: 0,
        commission: 0,
        // Trading
        tradingRevenue: 0,
        ordersCount: 0,
        avgTicket: 0,
        // Global
        globalRevenue: 0,
        globalOperations: 0,
        globalMargin: 0,
        // Changes
        revenueChange: 0,
        tripsChange: 0,
        commissionChange: 0
    });

    // Graph Data
    const [graphData, setGraphData] = useState<{ date: string, logistics: number, trading: number }[]>([]);

    const loadData = async () => {
        initializeData();
        const [fetchedBiz, fetchedUnits, fetchedDrivers] = await Promise.all([
            getBusinesses(),
            getUnits(),
            getDrivers()
        ]);
        setAllData({
            businesses: fetchedBiz,
            units: fetchedUnits,
            drivers: fetchedDrivers
        });

        await calculateStats();
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (!loading) calculateStats();
    }, [filters, timeRange, viewMode]);

    const calculateStats = async () => {
        // Fetch all raw data
        const [trips, pricing, transactions, leads] = await Promise.all([
            getTrips(),
            getPricingSettings(),
            getTransactions(),
            getLeads()
        ]);

        // Update Leads State (Top 5 Pending)
        const pendingLeads = leads.filter(l => l.status === 'Pendiente').slice(0, 5);
        setRecentLeads(pendingLeads);

        // Save globally available trips for credit calculations
        setAllTrips(trips);

        // Update Recent Trips State (Top 2 Recent to strictly match visual height)
        setRecentTrips(trips.slice(0, 2));

        // 1. Apply Entity Filters
        let filteredEntityTrips = trips;
        let filteredTransactions = transactions;

        if (filters.businessId) {
            filteredEntityTrips = filteredEntityTrips.filter(t => t.client === filters.businessId);
            filteredTransactions = filteredTransactions.filter(t => t.providerName === filters.businessId || t.receiverName === filters.businessId);
        }

        if (filters.unitId) {
            filteredEntityTrips = filteredEntityTrips.filter(t => t.plate === filters.unitId || t.client === filters.unitId);
        }

        if (filters.driverId) {
            filteredEntityTrips = filteredEntityTrips.filter(t => t.driver === filters.driverId);
        }

        // 2. Determine Date Ranges
        const now = new Date();
        let startDate = new Date();
        let endIter = new Date();

        // Previous Period Date Ranges
        let prevStartDate = new Date();
        let prevEndIter = new Date();

        if (timeRange === '7d') {
            startDate.setDate(now.getDate() - 6);
            // Previous 7 days
            prevEndIter = new Date(startDate);
            prevEndIter.setDate(prevEndIter.getDate() - 1);
            prevStartDate = new Date(prevEndIter);
            prevStartDate.setDate(prevStartDate.getDate() - 6);
        }
        else if (timeRange === '30d') {
            startDate.setDate(now.getDate() - 29);
            // Previous 30 days
            prevEndIter = new Date(startDate);
            prevEndIter.setDate(prevEndIter.getDate() - 1);
            prevStartDate = new Date(prevEndIter);
            prevStartDate.setDate(prevStartDate.getDate() - 29);
        }
        else if (timeRange === '3m') {
            startDate.setDate(now.getDate() - 90);
            // Previous 90 days
            prevEndIter = new Date(startDate);
            prevEndIter.setDate(prevEndIter.getDate() - 1);
            prevStartDate = new Date(prevEndIter);
            prevStartDate.setDate(prevStartDate.getDate() - 90);
        }
        else if (timeRange === '6m') {
            startDate.setDate(now.getDate() - 180);
            // Previous 180 days
            prevEndIter = new Date(startDate);
            prevEndIter.setDate(prevEndIter.getDate() - 1);
            prevStartDate = new Date(prevEndIter);
            prevStartDate.setDate(prevStartDate.getDate() - 180);
        }
        else if (timeRange === '1y') {
            startDate.setDate(now.getDate() - 365);
            // Previous Year
            prevEndIter = new Date(startDate);
            prevEndIter.setDate(prevEndIter.getDate() - 1);
            prevStartDate = new Date(prevEndIter);
            prevStartDate.setDate(prevStartDate.getDate() - 365);
        }
        else if (timeRange === 'this_month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            // Last Month
            prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            prevEndIter = new Date(now.getFullYear(), now.getMonth(), 0);
        }
        else if (timeRange === 'last_month') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endIter = new Date(now.getFullYear(), now.getMonth(), 0);
            // Two Months Ago
            prevStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            prevEndIter = new Date(now.getFullYear(), now.getMonth() - 1, 0);
        }

        startDate.setHours(0, 0, 0, 0);

        // Helper to check range
        const isInRange = (dStr: string, start: Date, end: Date) => {
            if (!dStr) return false;
            const d = new Date(dStr);
            const e = new Date(end);
            e.setHours(23, 59, 59, 999);
            return d >= start && d <= e;
        };

        // 3. Filter by Date (Current Period)
        const currentTripsFiltered = filteredEntityTrips.filter(t => isInRange(t.rawDate, startDate, endIter));
        const currentTransactions = filteredTransactions.filter(t => isInRange(t.transactionDate, startDate, endIter));

        // 3b. Filter by Date (Previous Period)
        const prevTripsFiltered = filteredEntityTrips.filter(t => isInRange(t.rawDate, prevStartDate, prevEndIter));
        const prevTransactions = filteredTransactions.filter(t => isInRange(t.transactionDate, prevStartDate, prevEndIter));

        // 4. Calculate Current Metrics
        const logisticsRevenue = currentTripsFiltered.filter(t => t.status === 'Completado').reduce((sum, t) => sum + t.cost, 0);
        const tripsCount = currentTripsFiltered.filter(t => t.status !== 'Cancelado').length;
        // Commission applies to Logistics
        const commission = logisticsRevenue * (pricing.commissionRate / 100);

        const tradingRevenue = currentTransactions.filter(t => t.status !== 'Cancelado').reduce((sum, t) => sum + t.totalCost, 0);
        const ordersCount = currentTransactions.length;
        const avgTicket = ordersCount > 0 ? tradingRevenue / ordersCount : 0;

        // NEW: Commission also applies to Trading (Ventas y Cruces) based on platform rate
        const tradingCommission = tradingRevenue * (pricing.commissionRate / 100);

        // NEW METRICS: Efectivo a Entregar & Crédito Comercial
        // Efectivo a Entregar (Repartidores) -> Cash trips (no businessId) that are Completed but Pending Payment
        const driverCash = currentTripsFiltered
            .filter(t => t.status === 'Completado' && t.paymentStatus === 'Pendiente' && !t.businessId)
            .reduce((sum, t) => sum + t.cost, 0);

        // Crédito Comercial (Deuda Global Acumulada) -> Commercial trips (businessId exists) that are unpaid
        // Note: we use allTrips instead of currentTripsFiltered to get the total accumulated debt, regardless of date filter
        const clientDebt = allTrips
            .filter(t => t.businessId && t.paymentStatus !== 'Pagado' && t.status !== 'Cancelado')
            .reduce((sum, t) => sum + t.cost, 0);

        const globalRevenue = logisticsRevenue + tradingRevenue;
        const globalOperations = tripsCount + ordersCount;
        const globalMargin = commission + tradingCommission;

        // 5. Calculate Previous Metrics & Deltas
        const prevLogisticsRevenue = prevTripsFiltered.filter(t => t.status === 'Completado').reduce((sum, t) => sum + t.cost, 0);
        const prevTripsCount = prevTripsFiltered.filter(t => t.status !== 'Cancelado').length;
        const prevCommission = prevLogisticsRevenue * (pricing.commissionRate / 100);

        const prevTradingRevenue = prevTransactions.filter(t => t.status !== 'Cancelado').reduce((sum, t) => sum + t.totalCost, 0);
        // Previous Trading Commission
        const prevTradingCommission = prevTradingRevenue * (pricing.commissionRate / 100);

        const prevGlobalRevenue = prevLogisticsRevenue + prevTradingRevenue;

        // Helper for % change
        const calcChange = (curr: number, prev: number) => {
            if (prev === 0) return curr === 0 ? 0 : 100;
            return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
        };

        const revenueChange = calcChange(globalRevenue, prevGlobalRevenue);
        const tripsChange = calcChange(tripsCount, prevTripsCount);

        // Trading specific deltas for Trading Mode
        const tradingRevenueChange = calcChange(tradingRevenue, prevTradingRevenue);
        const ordersChange = calcChange(ordersCount, prevTransactions.length);

        setStats({
            // Metrics
            logisticsRevenue, tripsCount, commission,
            tradingRevenue, ordersCount, avgTicket,
            globalRevenue, globalOperations, globalMargin,
            driverCash, clientDebt, // NEW
            // Context-aware Deltas based on ViewMode
            revenueChange: viewMode === 'trading' ? tradingRevenueChange : (viewMode === 'logistics' ? calcChange(logisticsRevenue, prevLogisticsRevenue) : revenueChange),
            tripsChange: viewMode === 'trading' ? ordersChange : (viewMode === 'logistics' ? tripsChange : calcChange(globalOperations, prevTripsCount + prevTransactions.length)),
            commissionChange: viewMode === 'trading' ? calcChange(tradingCommission, prevTradingCommission) : (viewMode === 'logistics' ? calcChange(commission, prevCommission) : calcChange(globalMargin, prevCommission + prevTradingCommission))
        });

        setTotalRevenue(logisticsRevenue);
        setRateInput(pricing.commissionRate);

        // 6. Generate Graph Data (Buckets by Day)
        const daysMap = new Map<string, { logistics: number, trading: number }>();

        // Fill buckets
        const tempD = new Date(startDate);
        const endD = new Date(endIter);
        while (tempD <= endD) {
            daysMap.set(tempD.toISOString().split('T')[0], { logistics: 0, trading: 0 });
            tempD.setDate(tempD.getDate() + 1);
        }

        // Fill Logistics Data
        currentTripsFiltered.forEach(t => {
            const dStr = new Date(t.rawDate).toISOString().split('T')[0];
            if (daysMap.has(dStr) && t.status === 'Completado') {
                const prev = daysMap.get(dStr)!;
                daysMap.set(dStr, { ...prev, logistics: prev.logistics + t.cost });
            }
        });

        // Fill Trading Data (REAL)
        currentTransactions.forEach(t => {
            const dStr = new Date(t.transactionDate).toISOString().split('T')[0];
            if (daysMap.has(dStr) && t.status !== 'Cancelado') {
                const prev = daysMap.get(dStr)!;
                daysMap.set(dStr, { ...prev, trading: prev.trading + t.totalCost });
            }
        });

        const graphArr = Array.from(daysMap.entries()).map(([date, val]) => ({ date, ...val }));
        graphArr.sort((a, b) => a.date.localeCompare(b.date));
        setGraphData(graphArr);
    };





    const handleDownloadPDF = () => {
        try {
            const pdf = new jsPDF('p', 'mm', 'letter');
            const w = 216;
            let y = 20;
            pdf.setFillColor(5, 16, 36);
            pdf.rect(0, 0, w, 30, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
            pdf.text('HEALTHY DREAM — Reporte del Panel de Control', 14, 14);
            pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
            const modeLabel = viewMode === 'logistics' ? 'Logística' : viewMode === 'trading' ? 'Comercializadora' : 'Global';
            pdf.text(`Vista: ${modeLabel} | ${new Date().toLocaleDateString('es-MX')}`, 14, 22);
            y = 40;
            pdf.setTextColor(30, 41, 59); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
            pdf.text('Resumen de Métricas', 14, y); y += 8;
            pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
            const metrics: [string, string][] = viewMode === 'logistics' ? [
                ['Ingresos Logísticos', formatCurrency(stats.logisticsRevenue)],
                ['Entregas Completadas', stats.tripsCount.toString()],
                [`Comisiones (${rateInput}%)`, formatCurrency(stats.commission)],
                ['Efectivo a Entregar', formatCurrency((stats as any).driverCash || 0)],
                ['Deuda Clientes (Acum.)', formatCurrency((stats as any).clientDebt || 0)],
            ] : viewMode === 'trading' ? [
                ['Ventas B2B', formatCurrency(stats.tradingRevenue)],
                ['Pedidos Activos', stats.ordersCount.toString()],
                [`Comisiones (${rateInput}%)`, formatCurrency(stats.tradingRevenue * (rateInput / 100))],
            ] : [
                ['Ingresos Totales', formatCurrency(stats.globalRevenue)],
                ['Operaciones Totales', stats.globalOperations.toString()],
                ['Ganancia Neta', formatCurrency(stats.globalMargin)],
                ['Efectivo a Entregar', formatCurrency((stats as any).driverCash || 0)],
                ['Deuda Clientes (Acum.)', formatCurrency((stats as any).clientDebt || 0)],
            ];
            metrics.forEach(([label, value]) => {
                pdf.setTextColor(100, 116, 139); pdf.text(label, 14, y);
                pdf.setTextColor(30, 41, 59); pdf.setFont('helvetica', 'bold'); pdf.text(value, 100, y);
                pdf.setFont('helvetica', 'normal'); y += 6;
            });
            y += 6;
            pdf.setTextColor(150, 160, 170); pdf.setFontSize(6);
            pdf.text(`Documento generado el ${new Date().toLocaleString('es-MX')} — Healthy Dream Sistema de Repartos`, 14, y);
            const arrayBuffer = pdf.output('arraybuffer');
            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `HD-Reporte-${modeLabel}-${new Date().toISOString().split('T')[0]}.pdf`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 200);
        } catch (err) {
            console.error('Error generating dashboard PDF:', err);
            alert('Error al generar el PDF.');
        }
    };

    // Graph Utilities
    const generatePath = (data: typeof graphData, key: 'logistics' | 'trading', width: number, height: number, maxVal: number) => {
        if (data.length === 0) return "";
        const stepX = width / (data.length - 1 || 1);

        const points = data.map((d, i) => {
            const val = d[key];
            const x = data.length > 1 ? i * stepX : width / 2;
            const y = height - (val / maxVal) * height;
            return `${x},${y} `;
        });

        if (data.length < 2) return `M0, ${height} L${width},${height} `;

        let d = `M ${points[0]} `;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i]} `;
        }
        return d;
    };

    // Fill Area under line
    const generateArea = (pathStr: string, width: number, height: number) => {
        const parts = pathStr.split(" ");
        if (!pathStr || parts.length < 3) return "";
        return `${pathStr} L ${width},${height} L 0, ${height} Z`;
    };



    if (loading) {
        return <div className="flex-1 flex items-center justify-center h-full bg-background-light text-primary font-bold">Cargando dashboard...</div>;
    }

    // Prepare Graph Scaling
    const allValues = graphData.flatMap(d => viewMode === 'global' ? [d.logistics, d.trading] : (viewMode === 'logistics' ? [d.logistics] : [d.trading]));
    const maxVal = Math.max(...allValues, 1000) * 1.1; // 10% buffering

    const logisticsPath = generatePath(graphData, 'logistics', 800, 200, maxVal);
    const tradingPath = generatePath(graphData, 'trading', 800, 200, maxVal);





    const renderCards = () => {
        if (viewMode === 'logistics') {
            return (
                <>
                    <MetricCard title="Ingresos Logísticos" value={formatCurrency(stats.logisticsRevenue)} change={stats.revenueChange} icon="local_shipping" color="blue" />
                    <MetricCard title="Entregas Completadas" value={stats.tripsCount.toString()} change={stats.tripsChange} icon="route" color="indigo" />
                    <MetricCard title={`Comisiones Ops(${rateInput} %)`} value={formatCurrency(stats.commission)} change={stats.commissionChange} icon="payments" color="green" />
                    {/* NEW METRICS */}
                    <MetricCard title="Efectivo a Entregar" value={formatCurrency(stats.driverCash)} change={0} icon="payments" color="amber" />
                    <MetricCard title="Deuda Clientes (Acum.)" value={formatCurrency(stats.clientDebt)} change={0} icon="account_balance_wallet" color="rose" />
                </>
            );
        } else if (viewMode === 'trading') {
            return (
                <>
                    <MetricCard title="Ventas B2B" value={formatCurrency(stats.tradingRevenue)} change={stats.revenueChange} icon="storefront" color="amber" />
                    <MetricCard title="Pedidos Activos" value={stats.ordersCount.toString()} change={stats.tripsChange} icon="inventory_2" color="orange" />
                    <MetricCard title={`Comisiones Ops(${rateInput} %)`} value={formatCurrency(stats.tradingRevenue * (rateInput / 100))} change={stats.commissionChange} icon="payments" color="rose" />
                </>
            );
        } else {
            return (
                <>
                    <MetricCard title="Ingresos Totales" value={formatCurrency(stats.globalRevenue)} change={stats.revenueChange} icon="account_balance" color="emerald" />
                    <MetricCard title="Operaciones Totales" value={stats.globalOperations.toString()} change={stats.tripsChange} icon="hub" color="cyan" />
                    <MetricCard title="Ganancia Neta (Comisiones)" value={formatCurrency(stats.globalMargin)} change={stats.commissionChange} icon="pie_chart" color="violet" />
                    {/* NEW METRICS */}
                    <MetricCard title="Efectivo a Entregar" value={formatCurrency(stats.driverCash)} change={0} icon="payments" color="amber" />
                    <MetricCard title="Deuda Clientes (Acum.)" value={formatCurrency(stats.clientDebt)} change={0} icon="account_balance_wallet" color="rose" />
                </>
            );
        }
    };

    return (
        <div className="flex-1 h-full overflow-y-auto pb-20">
            <style>
                {`
@media print {
    .no-print { display: none!important; }
    aside, nav { display: none!important; }
}
`}
            </style>
            <header className="sticky top-0 z-10 bg-background-light/95 px-8 py-6 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-[#111118] text-3xl font-extrabold leading-tight tracking-tight">Panel de Control</h2>
                    <p className="text-[#636388] text-sm font-medium">Gestión integral del ecosistema Healthy Dream.</p>
                </div>

                {/* MODE SWITCHER */}
                <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 no-print">
                    <button
                        onClick={() => navigate('/dashboard/logistica')}
                        className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'logistics' ? 'bg-white text-[#170c86] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Logística
                    </button>
                    <button
                        onClick={() => navigate('/dashboard/comercializadora')}
                        className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'trading' ? 'bg-white text-[#170c86] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Comercializadora
                    </button>
                    <button
                        onClick={() => navigate('/dashboard/global')}
                        className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'global' ? 'bg-white text-[#170c86] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Global
                    </button>
                </div>

                <div className="flex gap-3 no-print">
                    <button
                        onClick={handleDownloadPDF}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors text-sm font-bold text-[#111118]">
                        <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                        <span>Exportar</span>
                    </button>
                </div>
            </header>

            <div className="p-8 flex flex-col gap-8 max-w-[1400px]">
                {notification && (
                    <div className={`p-4 rounded-lg flex items-center gap-3 animate-in slide-in-from-top-2 ${notification.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                        <span className="material-symbols-outlined">{notification.type === 'success' ? 'check_circle' : 'error'}</span>
                        <span className="font-bold">{notification.msg}</span>
                    </div>
                )}

                {/* Filters Row */}
                <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-xl border border-gray-100 shadow-sm no-print">
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Negocio / Cliente</label>
                        <select
                            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-primary"
                            value={filters.businessId}
                            onChange={(e) => setFilters({ ...filters, businessId: e.target.value })}
                        >
                            <option value="">Todos</option>
                            {allData.businesses.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                        </select>
                    </div>

                    {/* Conditional Filters based on View Mode */}
                    {viewMode === 'logistics' && (
                        <>
                            <div className="flex-1 min-w-[200px]">
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Unidad</label>
                                <select
                                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-primary"
                                    value={filters.unitId}
                                    onChange={(e) => setFilters({ ...filters, unitId: e.target.value })}
                                >
                                    <option value="">Todas</option>
                                    {allData.units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                </select>
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Repartidor</label>
                                <select
                                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-primary"
                                    value={filters.driverId}
                                    onChange={(e) => setFilters({ ...filters, driverId: e.target.value })}
                                >
                                    <option value="">Todos</option>
                                    {allData.drivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                </select>
                            </div>
                        </>
                    )}

                    {viewMode === 'trading' && (
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Categoría Producto</label>
                            <select
                                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-primary"
                                value={filters.productCategory}
                                onChange={(e) => setFilters({ ...filters, productCategory: e.target.value })}
                            >
                                <option value="">Todas</option>
                                <option value="office">Oficina y Papelería</option>
                                <option value="industrial">Industrial y EPP</option>
                                <option value="technology">Tecnología</option>
                            </select>
                        </div>
                    )}

                    <button
                        onClick={() => setFilters({ businessId: '', unitId: '', driverId: '', productCategory: '' })}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-bold text-sm transition-colors"
                    >
                        Limpiar
                    </button>
                    <div className="w-px h-8 bg-gray-200 mx-2"></div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Periodo</label>
                        <select
                            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-[#111118] outline-none focus:ring-2 focus:ring-primary"
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value as any)}
                        >
                            <option value="7d">Últimos 7 días</option>
                            <option value="30d">Últimos 30 días</option>
                            <option value="this_month">Este Mes</option>
                            <option value="last_month">Mes Anterior</option>
                            <option value="3m">Últimos 3 Meses</option>
                            <option value="6m">Últimos 6 Meses</option>
                            <option value="1y">Último Año</option>
                        </select>
                    </div>
                </div>

                {/* KPI Cards Grid */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {renderCards()}
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* MAIN CHART */}
                    <div className="lg:col-span-2 bg-card-light rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-[#111118] text-lg font-bold">
                                    {viewMode === 'logistics' ? 'Ingresos por Transporte' : (viewMode === 'trading' ? 'Ingresos por Ventas' : 'Rendimiento Global')}
                                </h3>
                                <p className="text-[#636388] text-sm">Tendencia del periodo seleccionado</p>
                            </div>
                            {viewMode === 'global' && (
                                <div className="flex gap-4 text-xs font-bold">
                                    <div className="flex items-center gap-1">
                                        <span className="w-3 h-3 rounded-full bg-blue-600"></span> Logística
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="w-3 h-3 rounded-full bg-amber-500"></span> Trading
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="w-full h-[300px] relative">
                            {/* Y-Axis Grid */}
                            <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-400 font-medium pr-2 border-r border-dashed border-gray-200 py-2">
                                <span>{formatCurrency(maxVal)}</span>
                                <span>{formatCurrency(maxVal / 2)}</span>
                                <span>0</span>
                            </div>

                            <div className="absolute left-10 right-0 top-0 bottom-0 pt-2 pb-6 pl-2">
                                <svg className="overflow-visible" height="100%" preserveAspectRatio="none" viewBox="0 0 800 200" width="100%">
                                    <defs>
                                        <linearGradient id="logisticsGradient" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.1"></stop>
                                            <stop offset="100%" stopColor="#2563eb" stopOpacity="0"></stop>
                                        </linearGradient>
                                        <linearGradient id="tradingGradient" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.1"></stop>
                                            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0"></stop>
                                        </linearGradient>
                                    </defs>

                                    {/* Guides */}
                                    <line stroke="#e5e7eb" strokeDasharray="4 4" x1="0" x2="800" y1="0" y2="0"></line>
                                    <line stroke="#e5e7eb" strokeDasharray="4 4" x1="0" x2="800" y1="100" y2="100"></line>
                                    <line stroke="#e5e7eb" strokeDasharray="4 4" x1="0" x2="800" y1="200" y2="200"></line>

                                    {/* LOGISTICS LINE/AREA */}
                                    {(viewMode === 'logistics' || viewMode === 'global') && (
                                        <>
                                            <path d={generateArea(logisticsPath, 800, 200)} fill="url(#logisticsGradient)" stroke="none"></path>
                                            <path d={logisticsPath} fill="none" stroke="#2563eb" strokeLinecap="round" strokeWidth="3"></path>
                                        </>
                                    )}

                                    {/* TRADING LINE/AREA */}
                                    {(viewMode === 'trading' || viewMode === 'global') && (
                                        <>
                                            <path d={generateArea(tradingPath, 800, 200)} fill="url(#tradingGradient)" stroke="none"></path>
                                            <path d={tradingPath} fill="none" stroke="#f59e0b" strokeLinecap="round" strokeWidth="3"></path>
                                            {/* Dots for trading if single view */}
                                            {viewMode === 'trading' && graphData.map((d, i) => {
                                                const x = graphData.length > 1 ? (i / (graphData.length - 1)) * 800 : 400;
                                                const y = 200 - (d.trading / maxVal) * 200;
                                                return <circle key={i} cx={x} cy={y} r="3" fill="#f59e0b" stroke="white" strokeWidth="2" />;
                                            })}
                                        </>
                                    )}
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Right Column Widgets */}
                    <div className="flex flex-col gap-6">



                        {/* RECENT TRIPS WIDGET (Logistics Only) */}
                        {viewMode === 'logistics' && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex-1 overflow-auto">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[#111118] text-lg font-bold">Historial Reciente</h3>
                                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">{recentTrips.length}</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {recentTrips.length === 0 ? (
                                        <p className="text-gray-400 text-sm text-center py-4">No hay entregas recientes.</p>
                                    ) : (
                                        recentTrips.map((trip) => (
                                            <div key={trip.id} className="flex flex-col p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-bold text-sm text-gray-800 truncate max-w-[150px]">{trip.client}</span>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trip.status === 'Pendiente' ? 'text-amber-600 bg-amber-50' : (trip.status === 'Completado' ? 'text-green-600 bg-green-50' : 'text-gray-600 bg-gray-50')}`}>
                                                        {trip.status}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-end text-xs text-gray-500">
                                                    <span>{trip.origin} → {trip.destination}</span>
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-1">
                                                    {new Date(trip.rawDate || trip.date).toLocaleDateString()}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    <button
                                        onClick={() => navigate('/trips')}
                                        className="text-center text-xs font-bold text-primary mt-2 hover:underline"
                                    >
                                        Ver historial completo
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* PENDING APPROVALS WIDGET (Trading Only) */}
                        {viewMode === 'trading' && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex-1 overflow-auto">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[#111118] text-lg font-bold">Solicitudes Recientes</h3>
                                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">{recentLeads.length}</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {recentLeads.length === 0 ? (
                                        <p className="text-gray-400 text-sm text-center py-4">No hay solicitudes pendientes.</p>
                                    ) : (
                                        recentLeads.map((lead) => (
                                            <div key={lead.id} className="flex flex-col p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-bold text-sm text-gray-800">{lead.companyName}</span>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${lead.status === 'Pendiente' ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50'}`}>{lead.status}</span>
                                                </div>
                                                <div className="flex justify-between items-end text-xs text-gray-500">
                                                    <span>Solicita: {lead.contactName}</span>
                                                    <span className="font-bold text-gray-900 text-sm">{lead.serviceType}</span>
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-1 truncate">
                                                    {lead.messageDetails}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    <button
                                        onClick={() => navigate('/comercializadora')}
                                        className="text-center text-xs font-bold text-primary mt-2 hover:underline"
                                    >
                                        Ver todas las solicitudes
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>


            </div >
        </div >
    );
};

// Helper Component for Cards
const MetricCard = ({ title, value, change, icon, color }: { title: string, value: string, change: number, icon: string, color: string }) => {
    // Color mapping
    const bgColors: Record<string, string> = { blue: 'bg-blue-100 text-blue-700', indigo: 'bg-indigo-100 text-indigo-700', green: 'bg-green-100 text-green-700', amber: 'bg-amber-100 text-amber-700', orange: 'bg-orange-100 text-orange-700', rose: 'bg-rose-100 text-rose-700', emerald: 'bg-emerald-100 text-emerald-700', cyan: 'bg-cyan-100 text-cyan-700', violet: 'bg-violet-100 text-violet-700' };

    return (
        <div className="bg-card-light p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-40 group hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
                <div className={`p-2 rounded-lg ${bgColors[color] || bgColors.blue}`}>
                    <span className="material-symbols-outlined">{icon}</span>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${change >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                    <span className="material-symbols-outlined text-[14px]">{change >= 0 ? 'trending_up' : 'trending_down'}</span>
                    {change > 0 ? '+' : ''}{change}%
                </span>
            </div>
            <div>
                <p className="text-[#636388] text-sm font-semibold mb-1">{title}</p>
                <h3 className="text-[#111118] text-3xl font-bold tracking-tight">{value}</h3>
            </div>
        </div>
    );
};

export default Dashboard;