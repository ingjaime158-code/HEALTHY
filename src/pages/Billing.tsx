import React, { useState, useEffect, useMemo } from 'react';
import { getTripsByDateRange, updateTripPaymentStatus, Trip, createPaymentReceipt, createDriverSettlement, getFleetExpensesByDateRange, createFleetExpense, FleetExpense, getUnits, FleetUnit } from '../services/dataService';
import jsPDF from 'jspdf';

const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

// Sanitize strings for jsPDF (Helvetica only supports WinAnsiEncoding / basic Latin)
const safe = (s: string | null | undefined): string => {
    if (!s) return '';
    return s
        .replace(/[\u2014\u2013]/g, '-')   // em-dash / en-dash
        .replace(/[\u201C\u201D]/g, '"')   // curly double quotes
        .replace(/[\u2018\u2019]/g, "'")   // curly single quotes
        .replace(/[\u2026]/g, '...')        // ellipsis
        .replace(/[\u00A0]/g, ' ')          // non-breaking space
        .replace(/[^\x20-\x7E\xA1-\xFF]/g, ''); // strip remaining non-latin1 chars
};

const safeFmt = (n: number) => {
    const val = Number(n);
    return fmt(isNaN(val) ? 0 : val);
};

type DateFilter = 'today' | 'week' | 'month' | 'custom';

const getDateRange = (filter: DateFilter, customFrom?: string, customTo?: string) => {
    const now = new Date();
    let from: Date, to: Date;
    to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    switch (filter) {
        case 'today':
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            break;
        case 'week':
            from = new Date(now);
            from.setDate(now.getDate() - now.getDay());
            from.setHours(0, 0, 0, 0);
            break;
        case 'month':
            from = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'custom':
            from = customFrom ? new Date(customFrom + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
            to = customTo ? new Date(customTo + 'T23:59:59') : to;
            break;
        default:
            from = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { from, to };
};

interface GroupedAccount {
    id: string;
    name: string;
    trips: Trip[];
    total: number;
    paid: number;
    pending: number;
}

const generateTicketPDF = (trip: Trip, entityName: string): jsPDF => {
    const pdf = new jsPDF('p', 'mm', [100, 180]);
    const w = 100;
    let y = 12;
    pdf.setFillColor(5, 16, 36);
    pdf.rect(0, 0, w, 32, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('HEALTHY DREAM', w / 2, y, { align: 'center' });
    y += 5;
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text('COMPROBANTE DE COBRO', w / 2, y, { align: 'center' });
    y += 5;
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(safe(entityName).substring(0, 30), w / 2, y, { align: 'center' });
    y += 15;
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text('FECHA', 8, y);
    pdf.text('HORA', w - 8, y, { align: 'right' });
    y += 4;
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(9);
    pdf.text(safe(trip.date) || '--', 8, y);
    pdf.text(safe(trip.time) || '--', w - 8, y, { align: 'right' });
    y += 4;
    pdf.setDrawColor(200, 210, 220);
    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(8, y, w - 8, y);
    y += 5;
    pdf.setTextColor(100, 116, 139); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    pdf.text('# ID ENTREGA', 8, y); y += 4;
    pdf.setTextColor(30, 41, 59); pdf.setFontSize(9); pdf.setFont('courier', 'bold');
    pdf.text(safe(trip.id).substring(0, 8).toUpperCase(), 8, y); y += 5;
    pdf.setTextColor(100, 116, 139); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    pdf.text('DESTINATARIO', 8, y); y += 4;
    pdf.setTextColor(30, 41, 59); pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
    pdf.text(safe(trip.passengerName) || 'Desconocido', 8, y); y += 5;
    pdf.setTextColor(100, 116, 139); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    pdf.text('REPARTIDOR', 8, y); y += 4;
    pdf.setTextColor(30, 41, 59); pdf.setFontSize(9);
    pdf.text(trip.driver && trip.driver !== 'Unknown' ? safe(trip.driver) : 'Sin Asignar', 8, y); y += 5;
    pdf.setTextColor(100, 116, 139); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    pdf.text('BASE', 8, y); y += 4;
    pdf.setTextColor(30, 41, 59); pdf.setFontSize(9);
    pdf.text(safe(trip.unitName) || 'Sin Base', 8, y); y += 5;
    // Origin/Dest
    pdf.setDrawColor(59, 130, 246); pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(8, y, w - 16, 14, 2, 2, 'FD');
    pdf.setLineWidth(0.8); pdf.setDrawColor(59, 130, 246);
    pdf.line(8, y, 8, y + 14); pdf.setLineWidth(0.2);
    y += 4;
    pdf.setTextColor(59, 130, 246); pdf.setFontSize(6); pdf.setFont('helvetica', 'bold');
    pdf.text('ORIGEN', 12, y); pdf.text('DESTINO', w / 2 + 2, y); y += 3;
    pdf.setTextColor(51, 65, 85); pdf.setFontSize(7); pdf.setFont('helvetica', 'normal');
    pdf.text(safe(trip.origin).split(',')[0].substring(0, 25) || '-', 12, y);
    pdf.text(safe(trip.destination).split(',')[0].substring(0, 25) || '-', w / 2 + 2, y);
    y += 12;
    // Capturado por
    if (trip.createdBy) {
        pdf.setTextColor(100, 116, 139); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
        pdf.text('CAPTURADO POR', 8, y); y += 4;
        pdf.setTextColor(30, 41, 59); pdf.setFontSize(8);
        pdf.text(safe(trip.createdBy), 8, y); y += 5;
    }
    // Status
    pdf.setTextColor(100, 116, 139); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    pdf.text('ESTATUS PAGO', 8, y); y += 4;
    const isPaid = trip.paymentStatus === 'Pagado';
    pdf.setTextColor(isPaid ? 22 : 185, isPaid ? 163 : 28, isPaid ? 74 : 28);
    pdf.setFontSize(9);
    pdf.text(isPaid ? 'PAGADO' : 'PENDIENTE', 8, y); y += 6;
    // Total
    pdf.setDrawColor(200, 210, 220); pdf.setLineDashPattern([1, 1], 0);
    pdf.line(8, y, w - 8, y); y += 5;
    pdf.setTextColor(100, 116, 139); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold');
    pdf.text('TOTAL', 8, y);
    pdf.setTextColor(15, 23, 42); pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
    pdf.text(safeFmt(trip.cost), w - 8, y, { align: 'right' }); y += 8;
    pdf.setTextColor(150, 160, 170); pdf.setFontSize(6); pdf.setFont('helvetica', 'normal');
    pdf.text('Documento generado por HEALTHY DREAM', w / 2, y, { align: 'center' });
    return pdf;
};

const generateBulkPDF = (trips: Trip[], entityName: string): jsPDF => {
    const pdf = new jsPDF('p', 'mm', 'letter');
    const w = 216; // letter width mm
    let y = 20;
    // Header
    pdf.setFillColor(5, 16, 36);
    pdf.rect(0, 0, w, 30, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
    pdf.text('HEALTHY DREAM - Estado de Cuenta', 14, 14);
    pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
    pdf.text(safe(entityName), 14, 22);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    pdf.text('Generado: ' + new Date().toLocaleDateString('es-MX'), 14, 28);
    y = 40;
    // Summary
    const total = trips.reduce((s, t) => s + (Number(t.cost) || 0), 0);
    const paid = trips.filter(t => t.paymentStatus === 'Pagado').reduce((s, t) => s + (Number(t.cost) || 0), 0);
    const pending = total - paid;
    pdf.setTextColor(30, 41, 59); pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
    pdf.text('Total: ' + safeFmt(total) + '     Pagado: ' + safeFmt(paid) + '     Pendiente: ' + safeFmt(pending), 14, y);
    y += 10;
    // Table header
    pdf.setFillColor(241, 245, 249);
    pdf.rect(14, y - 4, w - 28, 8, 'F');
    pdf.setTextColor(100, 116, 139); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    const cols = [14, 38, 72, 108, 148, 172];
    const headers = ['ID', 'FECHA', 'DESTINATARIO', 'RUTA', 'TOTAL', 'ESTATUS'];
    headers.forEach((h, i) => pdf.text(h, cols[i], y));
    y += 6;
    pdf.setTextColor(30, 41, 59); pdf.setFontSize(7); pdf.setFont('helvetica', 'normal');
    trips.forEach(trip => {
        if (y > 260) { pdf.addPage(); y = 20; }
        pdf.text(safe(trip.id).substring(0, 8).toUpperCase(), cols[0], y);
        pdf.text(safe(trip.date) || '--', cols[1], y);
        pdf.text(safe(trip.passengerName || 'Desc.').substring(0, 20), cols[2], y);
        const routeText = safe((trip.origin || '').split(',')[0] + ' > ' + (trip.destination || '').split(',')[0]).substring(0, 30);
        pdf.text(routeText, cols[3], y);
        pdf.text(safeFmt(trip.cost), cols[4], y);
        const isPaid = trip.paymentStatus === 'Pagado';
        pdf.setTextColor(isPaid ? 22 : 185, isPaid ? 163 : 28, isPaid ? 74 : 28);
        pdf.text(isPaid ? 'Pagado' : 'Pendiente', cols[5], y);
        pdf.setTextColor(30, 41, 59);
        y += 5;
    });
    y += 8;
    pdf.setDrawColor(200, 210, 220); pdf.line(14, y, w - 14, y); y += 6;
    pdf.setTextColor(150, 160, 170); pdf.setFontSize(6);
    pdf.text('Documento generado el ' + new Date().toLocaleString('es-MX') + ' - Healthy Dream Sistema de Repartos', 14, y);
    return pdf;
};

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, '').trim().replace(/\s+/g, '_');

const Billing = () => {
    const [tab, setTab] = useState<'commercial' | 'drivers' | 'expenses'>('commercial');
    const [loading, setLoading] = useState(true);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [expenses, setExpenses] = useState<FleetExpense[]>([]);
    const [units, setUnits] = useState<FleetUnit[]>([]);
    const [dateFilter, setDateFilter] = useState<DateFilter>('month');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [paymentModal, setPaymentModal] = useState<{ account: GroupedAccount; mode: 'total' | 'partial' | 'ticket' } | null>(null);
    const [partialAmount, setPartialAmount] = useState(0);
    const [selectedTickets, setSelectedTickets] = useState<string[]>([]);

    // B2B Payment Info
    const [paymentMethod, setPaymentMethod] = useState('Transferencia');
    const [paymentReference, setPaymentReference] = useState('');

    // Expense Form
    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [expenseForm, setExpenseForm] = useState({ unitId: '', expenseType: 'Gasolina', amount: '', notes: '', mileage: '' });

    useEffect(() => { loadData(); }, [dateFilter, customFrom, customTo]);

    const loadData = async () => {
        setLoading(true);
        const { from, to } = getDateRange(dateFilter, customFrom, customTo);
        const [allTrips, allExpenses, allUnits] = await Promise.all([
            getTripsByDateRange(from, to),
            getFleetExpensesByDateRange(from, to),
            getUnits()
        ]);
        setTrips(allTrips.filter(t => t.status === 'Completado' && t.cost > 0));
        setExpenses(allExpenses);
        setUnits(allUnits);
        setLoading(false);
    };

    const filteredTrips = trips; // Now pre-filtered from DB


    const commercialAccounts: GroupedAccount[] = useMemo(() => {
        const map = new Map<string, GroupedAccount>();
        filteredTrips.filter(t => t.businessId && t.paymentMethod !== 'Efectivo').forEach(t => {
            const key = t.businessId || 'unknown_b2b';
            if (!map.has(key)) map.set(key, { id: key, name: t.client || 'Cliente Desconocido', trips: [], total: 0, paid: 0, pending: 0 });
            const acc = map.get(key)!;
            acc.trips.push(t);
            acc.total += t.cost;
            if (t.paymentStatus === 'Pagado') acc.paid += t.cost;
            else acc.pending += t.cost;
        });
        return Array.from(map.values()).sort((a, b) => b.pending - a.pending);
    }, [filteredTrips]);

    const driverAccounts: GroupedAccount[] = useMemo(() => {
        const map = new Map<string, GroupedAccount>();
        filteredTrips.filter(t => t.paymentMethod === 'Efectivo' || !t.businessId).forEach(t => {
            const key = t.driverId || 'unknown_driver';
            if (!map.has(key)) map.set(key, { id: key, name: t.driver || 'Repartidor Desconocido', trips: [], total: 0, paid: 0, pending: 0 });
            const acc = map.get(key)!;
            acc.trips.push(t);
            acc.total += t.cost;
            if (t.driverSettled) acc.paid += t.cost; // Paid here means the driver settled the money to the admin
            else acc.pending += t.cost;
        });
        return Array.from(map.values()).sort((a, b) => b.pending - a.pending);
    }, [filteredTrips]);

    const accounts = tab === 'commercial' ? commercialAccounts : driverAccounts;
    const totalPending = accounts.reduce((s, a) => s + a.pending, 0);
    const totalPaid = accounts.reduce((s, a) => s + a.paid, 0);
    const totalAll = accounts.reduce((s, a) => s + a.total, 0);

    const filteredExpenses = expenses; // Now pre-filtered from DB


    const getPendingTrips = (acc: GroupedAccount) => {
        return tab === 'commercial' 
            ? acc.trips.filter(t => t.paymentStatus !== 'Pagado')
            : acc.trips.filter(t => !t.driverSettled);
    };

    const handlePayTotal = async (account: GroupedAccount) => {
        const pendingTrips = getPendingTrips(account);
        const tripIds = pendingTrips.map(t => t.id);
        
        if (tab === 'commercial') {
            await createPaymentReceipt(account.id, account.pending, paymentMethod, paymentReference, tripIds, 'Admin');
        } else {
            await createDriverSettlement(account.name, account.pending, tripIds, 'Admin', account.id);
        }

        await loadData();
        setPaymentModal(null);
    };

    const handlePayTickets = async (tripIds: string[]) => {
        if (!paymentModal) return;
        const totalAmount = paymentModal.account.trips.filter(t => tripIds.includes(t.id)).reduce((s,t) => s + t.cost, 0);

        if (tab === 'commercial') {
            await createPaymentReceipt(paymentModal.account.id, totalAmount, paymentMethod, paymentReference, tripIds, 'Admin');
        } else {
            await createDriverSettlement(paymentModal.account.name, totalAmount, tripIds, 'Admin', paymentModal.account.id);
        }

        await loadData();
        setPaymentModal(null);
        setSelectedTickets([]);
    };

    const handlePayPartial = async (account: GroupedAccount, amount: number) => {
        let remaining = amount;
        const pendingTrips = getPendingTrips(account).sort((a, b) => a.cost - b.cost);
        const coveredIds: string[] = [];

        for (const t of pendingTrips) {
            if (remaining >= t.cost) {
                coveredIds.push(t.id);
                remaining -= t.cost;
            } else break;
        }

        if (coveredIds.length > 0) {
            const consumedAmount = amount - remaining;
            if (tab === 'commercial') {
                await createPaymentReceipt(account.id, consumedAmount, paymentMethod, paymentReference, coveredIds, 'Admin');
            } else {
                await createDriverSettlement(account.name, consumedAmount, coveredIds, 'Admin', account.id);
            }
        }

        await loadData();
        setPaymentModal(null);
        setPartialAmount(0);
    };

    const handleDownloadSingle = (trip: Trip, entityName: string) => {
        try {
            const pdf = generateTicketPDF(trip, entityName);
            const safeName = sanitize(entityName);
            const tripId = (trip.id || '').substring(0, 8).toUpperCase();
            pdf.save(`${safeName}-${tripId}.pdf`);
        } catch (err) {
            console.error('Error generating single PDF:', err);
            alert('Error al generar el PDF. Intente de nuevo.');
        }
    };

    const handleDownloadBulk = (account: GroupedAccount) => {
        try {
            const pdf = generateBulkPDF(account.trips, account.name);
            const safeName = sanitize(account.name);
            const dateStr = new Date().toISOString().split('T')[0];
            pdf.save(`${safeName}-${dateStr}.pdf`);
        } catch (err) {
            console.error('Error generating bulk PDF:', err);
            alert('Error al generar el PDF. Intente de nuevo.');
        }
    };

    const handleUnpay = async (tripId: string) => {
        await updateTripPaymentStatus(tripId, 'Pendiente');
        await loadData();
    };

    const handleCreateExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!expenseForm.unitId || !expenseForm.amount) return alert('Unidad y monto son obligatorios.');
        await createFleetExpense(
            expenseForm.unitId,
            expenseForm.expenseType,
            Number(expenseForm.amount),
            'Admin',
            expenseForm.mileage ? Number(expenseForm.mileage) : undefined,
            expenseForm.notes
        );
        setExpenseModalOpen(false);
        setExpenseForm({ unitId: '', expenseType: 'Gasolina', amount: '', notes: '', mileage: '' });
        await loadData();
    };

    return (
        <div className="flex-1 bg-slate-50 overflow-hidden flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between items-center p-6 bg-white border-b border-slate-200 shrink-0">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800">Cuentas por Cobrar</h2>
                    <p className="text-slate-500 text-sm font-medium">Control de cobranza por cliente comercial y chofer</p>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Periodo:</span>
                        {(['today', 'week', 'month', 'custom'] as DateFilter[]).map(f => (
                            <button key={f} onClick={() => setDateFilter(f)}
                                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${dateFilter === f ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                                {f === 'today' ? 'Hoy' : f === 'week' ? 'Semana' : f === 'month' ? 'Mes' : 'Personalizado'}
                            </button>
                        ))}
                    </div>
                    {dateFilter === 'custom' && (
                        <div className="flex items-center gap-1.5">
                            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700" />
                            <span className="text-slate-400 text-xs">—</span>
                            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700" />
                        </div>
                    )}
                    <button onClick={loadData} className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors text-slate-600" title="Actualizar">
                        <span className="material-symbols-outlined text-[20px]">refresh</span>
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {tab !== 'expenses' ? (
                <div className="px-6 pt-4 pb-2 flex gap-4 shrink-0">
                    <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Facturado</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{fmt(totalAll)}</p>
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-red-100 p-4 shadow-sm">
                        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">{tab === 'commercial' ? 'Por Cobrar' : 'Pendiente'}</p>
                        <p className="text-2xl font-black text-red-600 mt-1">{fmt(totalPending)}</p>
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-green-100 p-4 shadow-sm">
                        <p className="text-[10px] font-black text-green-500 uppercase tracking-widest">{tab === 'commercial' ? 'Cobrado' : 'Entregado'}</p>
                        <p className="text-2xl font-black text-green-600 mt-1">{fmt(totalPaid)}</p>
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cuentas</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{accounts.length}</p>
                    </div>
                </div>
            ) : (
                <div className="px-6 pt-4 pb-2 flex gap-4 shrink-0">
                    <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Gastos</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{fmt(expenses.reduce((sum, e) => sum + e.amount, 0))}</p>
                    </div>
                     <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gasolina</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{fmt(expenses.filter(e => e.expenseType === 'Gasolina').reduce((sum, e) => sum + e.amount, 0))}</p>
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mantenimiento</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{fmt(expenses.filter(e => e.expenseType === 'Mantenimiento').reduce((sum, e) => sum + e.amount, 0))}</p>
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Otros / Peajes</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{fmt(expenses.filter(e => e.expenseType !== 'Gasolina' && e.expenseType !== 'Mantenimiento').reduce((sum, e) => sum + e.amount, 0))}</p>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="px-6 pt-2 pb-0 shrink-0 flex justify-between items-center">
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                    <button onClick={() => { setTab('commercial'); setExpandedId(null); }}
                        className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${tab === 'commercial' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                        <span className="material-symbols-outlined text-[18px]">business</span>
                        Clientes Comerciales
                        {commercialAccounts.length > 0 && <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-black">{commercialAccounts.length}</span>}
                    </button>
                    <button onClick={() => { setTab('drivers'); setExpandedId(null); }}
                        className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${tab === 'drivers' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                        <span className="material-symbols-outlined text-[18px]">delivery_dining</span>
                        Corte de Repartidores
                        {driverAccounts.length > 0 && <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-black">{driverAccounts.length}</span>}
                    </button>
                    <button onClick={() => { setTab('expenses'); setExpandedId(null); }}
                        className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${tab === 'expenses' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                        <span className="material-symbols-outlined text-[18px]">local_gas_station</span>
                        Gastos Operativos
                    </button>
                </div>
                {tab === 'expenses' && (
                    <button onClick={() => setExpenseModalOpen(true)} className="flex items-center gap-2 px-4 h-9 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm">
                        <span className="material-symbols-outlined text-[18px]">add</span> Nuevo Gasto
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 pt-4">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : tab === 'expenses' ? (
                    filteredExpenses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                            <span className="material-symbols-outlined text-5xl mb-2 opacity-40">receipt_long</span>
                            <p className="font-medium">No hay gastos operativos registrados en este periodo.</p>
                        </div>
                    ) : (
                        <div className="max-w-6xl mx-auto flex flex-col gap-3">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                        <tr>
                                            <th className="p-4 text-left">Fecha</th>
                                            <th className="p-4 text-left">Unidad</th>
                                            <th className="p-4 text-left">Tipo</th>
                                            <th className="p-4 text-left">Monto</th>
                                            <th className="p-4 text-left">Kilometraje</th>
                                            <th className="p-4 text-left">Notas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredExpenses.map(expense => {
                                            const unit = units.find(u => u.id === expense.unitId);
                                            return (
                                                <tr key={expense.id} className="hover:bg-slate-50/50">
                                                    <td className="p-4 text-xs font-medium text-slate-600">{new Date(expense.date).toLocaleDateString('es-MX')}</td>
                                                    <td className="p-4 text-xs font-bold text-slate-800">{unit ? unit.name : 'Desc.'}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border
                                                            ${expense.expenseType === 'Gasolina' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                              expense.expenseType === 'Mantenimiento' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                              'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                                            {expense.expenseType}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-sm font-black text-slate-800">{fmt(expense.amount)}</td>
                                                    <td className="p-4 text-xs text-slate-500">{expense.mileage ? `${expense.mileage} km` : '-'}</td>
                                                    <td className="p-4 text-xs text-slate-500 max-w-[200px] truncate" title={expense.notes || ''}>{expense.notes || '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                ) : accounts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                        <span className="material-symbols-outlined text-5xl mb-2 opacity-40">account_balance_wallet</span>
                        <p className="font-medium">No hay cuentas en este periodo.</p>
                    </div>
                ) : (
                    <div className="max-w-6xl mx-auto flex flex-col gap-3">
                        {accounts.map(acc => {
                            const isExpanded = expandedId === acc.id;
                            return (
                                <div key={acc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    {/* Account Header */}
                                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                        onClick={() => setExpandedId(isExpanded ? null : acc.id)}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm ${tab === 'commercial' ? 'bg-blue-600' : 'bg-amber-600'}`}>
                                                {acc.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800">{acc.name}</p>
                                                <p className="text-xs text-slate-400">{acc.trips.length} entrega{acc.trips.length !== 1 ? 's' : ''}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-xs text-slate-400 font-bold">Pendiente</p>
                                                <p className={`text-lg font-black ${acc.pending > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(acc.pending)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-slate-400 font-bold">Total</p>
                                                <p className="text-lg font-black text-slate-700">{fmt(acc.total)}</p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {acc.pending > 0 && (
                                                    <button onClick={(e) => { e.stopPropagation(); setPaymentModal({ account: acc, mode: 'total' }); setSelectedTickets([]); setPartialAmount(0); }}
                                                        className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-bold hover:bg-green-100 transition-colors border border-green-200 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">payments</span> {tab === 'commercial' ? 'Cobrar' : 'Corte'}
                                                    </button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); handleDownloadBulk(acc); }}
                                                    className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-slate-100 transition-colors border border-slate-200 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span> PDF
                                                </button>
                                                <span className={`material-symbols-outlined text-[20px] text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Expanded Trip List */}
                                    {isExpanded && (
                                        <div className="border-t border-slate-100">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                    <tr>
                                                        <th className="p-3 text-left">Folio</th>
                                                        <th className="p-3 text-left">Fecha</th>
                                                        <th className="p-3 text-left">Destinatario</th>
                                                        <th className="p-3 text-left">{tab === 'commercial' ? 'Repartidor' : 'Base'}</th>
                                                        <th className="p-3 text-left">Ruta</th>
                                                        <th className="p-3 text-left">Capturó</th>
                                                        <th className="p-3 text-right">Total</th>
                                                        <th className="p-3 text-center">Estatus</th>
                                                        <th className="p-3 text-center">Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {acc.trips.map(trip => (
                                                        <tr key={trip.id} className="hover:bg-slate-50/50">
                                                            <td className="p-3 font-mono font-bold text-slate-800 text-xs">#{(trip.id || '').substring(0, 8).toUpperCase()}</td>
                                                            <td className="p-3 text-xs text-slate-600">{trip.date}</td>
                                                            <td className="p-3 text-xs font-bold text-slate-700">{trip.passengerName || 'Desc.'}</td>
                                                            <td className="p-3 text-xs text-slate-500">{tab === 'commercial' ? trip.driver : trip.unitName}</td>
                                                            <td className="p-3 text-xs text-slate-500 max-w-[180px] truncate" title={`${trip.origin} → ${trip.destination}`}>
                                                                {(trip.origin || '').split(',')[0]} → {(trip.destination || '').split(',')[0]}
                                                            </td>
                                                            <td className="p-3 text-xs font-medium text-slate-600">{trip.createdBy || <span className="text-slate-300">—</span>}</td>
                                                            <td className="p-3 text-right font-bold text-slate-800">{fmt(trip.cost)}</td>
                                                            <td className="p-3 text-center">
                                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                                                    (tab === 'commercial' && trip.paymentStatus === 'Pagado') || 
                                                                    (tab === 'drivers' && trip.driverSettled)
                                                                    ? 'bg-green-50 text-green-700 border-green-200' 
                                                                    : 'bg-red-50 text-red-600 border-red-200'}`}>
                                                                    {(tab === 'commercial' && trip.paymentStatus === 'Pagado') || 
                                                                     (tab === 'drivers' && trip.driverSettled) 
                                                                     ? 'Saldado' 
                                                                     : 'Pendiente'}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-center">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    {((tab === 'commercial' && trip.paymentStatus !== 'Pagado') || (tab === 'drivers' && !trip.driverSettled)) ? (
                                                                        <button onClick={(e) => { e.stopPropagation(); setPaymentModal({ account: acc, mode: 'ticket' }); setSelectedTickets([trip.id]); }}
                                                                            className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors" title="Liquidar ticket">
                                                                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                                                        </button>
                                                                    ) : (
                                                                        <button onClick={() => alert("No se puede revertir fácilmente. Modifíquelo en Base de Datos por auditoría.")}
                                                                            className="p-1 rounded text-slate-300 transition-colors cursor-not-allowed" title="Pago Registrado" disabled>
                                                                            <span className="material-symbols-outlined text-[16px]">lock-off</span>
                                                                        </button>
                                                                    )}
                                                                    <button onClick={() => handleDownloadSingle(trip, acc.name)}
                                                                        className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Descargar PDF">
                                                                        <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {paymentModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPaymentModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-primary p-5 text-white">
                            <h3 className="text-lg font-bold">Registrar Cobro — {paymentModal.account.name}</h3>
                            <p className="text-white/70 text-sm">Pendiente: {fmt(paymentModal.account.pending)}</p>
                        </div>
                        <div className="p-5">
                            {/* Form for B2B */}
                            {tab === 'commercial' && (
                                <div className="grid grid-cols-2 gap-4 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Método de Pago</label>
                                        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                                            className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-primary outline-none">
                                            <option value="Transferencia">Transferencia</option>
                                            <option value="Efectivo">Efectivo</option>
                                            <option value="Cheque">Cheque</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cód. Rastreabilidad / Ref</label>
                                        <input type="text" value={paymentReference} onChange={e => setPaymentReference(e.target.value)}
                                            placeholder="Ej. REF-48201A"
                                            className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-primary outline-none" />
                                    </div>
                                </div>
                            )}

                            {/* Mode Tabs */}
                            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4">
                                {([['total', 'Total'], ['partial', 'Parcial'], ['ticket', 'Por Ticket']] as [string, string][]).map(([m, label]) => (
                                    <button key={m} onClick={() => { setPaymentModal({ ...paymentModal, mode: m as any }); setSelectedTickets([]); }}
                                        className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${paymentModal.mode === m ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {paymentModal.mode === 'total' && (
                                <div className="text-center py-4">
                                    <p className="text-sm text-slate-600 mb-2">Se marcarán como pagados todos los tickets pendientes.</p>
                                    <p className="text-3xl font-black text-green-600">{fmt(paymentModal.account.pending)}</p>
                                    <button onClick={() => handlePayTotal(paymentModal.account)}
                                        className="mt-4 px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors shadow-sm flex items-center gap-2 mx-auto">
                                        <span className="material-symbols-outlined">check_circle</span> Confirmar Cobro Total
                                    </button>
                                </div>
                            )}

                            {paymentModal.mode === 'partial' && (
                                <div className="text-center py-4">
                                    <p className="text-sm text-slate-600 mb-4">Ingresa el monto recibido. Se aplicará a los tickets de menor monto primero.</p>
                                    <div className="flex items-center justify-center gap-2 mb-4">
                                        <span className="text-2xl font-bold text-slate-400">$</span>
                                        <input type="number" value={partialAmount} onChange={e => setPartialAmount(Number(e.target.value))}
                                            className="text-3xl font-black text-center text-slate-800 w-40 border-b-2 border-slate-200 focus:border-primary outline-none py-1"
                                            min={0} max={paymentModal.account.pending} />
                                    </div>
                                    <button onClick={() => handlePayPartial(paymentModal.account, partialAmount)}
                                        disabled={partialAmount <= 0}
                                        className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 mx-auto disabled:opacity-50">
                                        <span className="material-symbols-outlined">payments</span> Aplicar Cobro Parcial
                                    </button>
                                </div>
                            )}

                            {paymentModal.mode === 'ticket' && (
                                <div className="py-2">
                                    <p className="text-sm text-slate-600 mb-3">Selecciona los tickets a marcar como pagados:</p>
                                    <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                        {paymentModal.account.trips.filter(t => t.paymentStatus !== 'Pagado').map(trip => (
                                            <label key={trip.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer">
                                                <input type="checkbox" checked={selectedTickets.includes(trip.id)}
                                                    onChange={e => {
                                                        if (e.target.checked) setSelectedTickets([...selectedTickets, trip.id]);
                                                        else setSelectedTickets(selectedTickets.filter(id => id !== trip.id));
                                                    }}
                                                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-slate-700">#{(trip.id || '').substring(0, 8).toUpperCase()} — {trip.passengerName || 'Desc.'}</p>
                                                    <p className="text-[10px] text-slate-400">{trip.date}</p>
                                                </div>
                                                <span className="font-bold text-slate-800 text-sm">{fmt(trip.cost)}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {selectedTickets.length > 0 && (
                                        <div className="mt-3 flex items-center justify-between">
                                            <p className="text-sm font-bold text-slate-700">
                                                {selectedTickets.length} seleccionado{selectedTickets.length !== 1 ? 's' : ''}: {fmt(paymentModal.account.trips.filter(t => selectedTickets.includes(t.id)).reduce((s, t) => s + t.cost, 0))}
                                            </p>
                                            <button onClick={() => handlePayTickets(selectedTickets)}
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 transition-colors flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[16px]">check_circle</span> Cobrar Seleccionados
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-50 border-t">
                            <button onClick={() => setPaymentModal(null)} className="w-full py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Expense Modal */}
            {expenseModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setExpenseModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-slate-800 p-5 text-white">
                            <h3 className="text-lg font-bold">Registrar Gasto Operativo</h3>
                            <p className="text-white/70 text-sm">Control de flota y gastos de vehículos</p>
                        </div>
                        <form onSubmit={handleCreateExpense} className="p-5 flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Unidad / Base</label>
                                    <select value={expenseForm.unitId} onChange={e => setExpenseForm({ ...expenseForm, unitId: e.target.value })}
                                        className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-primary outline-none" required>
                                        <option value="">Seleccionar...</option>
                                        {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tipo de Gasto</label>
                                    <select value={expenseForm.expenseType} onChange={e => setExpenseForm({ ...expenseForm, expenseType: e.target.value })}
                                        className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-primary outline-none">
                                        <option value="Gasolina">Gasolina</option>
                                        <option value="Mantenimiento">Mantenimiento</option>
                                        <option value="Peaje">Peaje</option>
                                        <option value="Lavandería">Lavandería</option>
                                        <option value="Otros">Otros</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Monto (MXN)</label>
                                    <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                        placeholder="0.00" step="0.01"
                                        className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-primary outline-none" required />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Kilometraje (Opc.)</label>
                                    <input type="number" value={expenseForm.mileage} onChange={e => setExpenseForm({ ...expenseForm, mileage: e.target.value })}
                                        placeholder="km"
                                        className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-primary outline-none" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Notas / Concepto</label>
                                <textarea value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                                    placeholder="Detalles del gasto..." rows={2}
                                    className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-primary outline-none resize-none" />
                            </div>

                            <div className="flex gap-2 mt-2">
                                <button type="button" onClick={() => setExpenseModalOpen(false)}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit"
                                    className="flex-[2] py-3 rounded-xl text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 transition-colors shadow-sm">
                                    Guardar Gasto
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Billing;
