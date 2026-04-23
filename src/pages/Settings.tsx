import React, { useState, useEffect } from 'react';
import { getPricingSettings, savePricingSettings, initializeData, getKPILogs, addKPILog, deleteKPILog, KPILog } from '../services/dataService';
import { formatCurrency } from '../utils/format';

const PricingSettings = () => {
    const [baseRate, setBaseRate] = useState(35.00);
    const [kmRate, setKmRate] = useState(9.00);
    const [commissionRate, setCommissionRate] = useState(20.00); // Default 20%
    const [notification, setNotification] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
    const [loading, setLoading] = useState(true);

    // KPI State
    const [kpiLogs, setKpiLogs] = useState<KPILog[]>([]);
    const [newKpiKey, setNewKpiKey] = useState('monthly_revenue_target');
    const [newKpiValue, setNewKpiValue] = useState(0);
    const [newKpiNotes, setNewKpiNotes] = useState('');

    useEffect(() => {
        const load = async () => {
            initializeData();
            const settings = await getPricingSettings();
            const kpis = await getKPILogs();
            setBaseRate(settings.baseRate);
            setKmRate(settings.kmRate);
            setCommissionRate(settings.commissionRate);
            setKpiLogs(kpis);
            setLoading(false);
        };
        load();
    }, []);

    const handleSave = async () => {
        try {
            const currentSettings = await getPricingSettings();
            await savePricingSettings({
                ...currentSettings,
                baseRate,
                kmRate,
                commissionRate
            });
            setNotification({ msg: 'Configuración guardada correctamente', type: 'success' });
            setTimeout(() => setNotification(null), 3000);
        } catch (error) {
            setNotification({ msg: 'Error al guardar la configuración', type: 'error' });
        }
    };

    const handleAddKpi = async () => {
        if (!newKpiKey || newKpiValue <= 0) {
            setNotification({ msg: 'Datos de métrica inválidos', type: 'error' });
            return;
        }
        const newLog = await addKPILog(newKpiKey, newKpiValue, newKpiNotes);
        if (newLog) {
            setKpiLogs([newLog, ...kpiLogs]);
            setNewKpiValue(0);
            setNewKpiNotes('');
            setNotification({ msg: 'Métrica añadida correctamente', type: 'success' });
            setTimeout(() => setNotification(null), 3000);
        } else {
            setNotification({ msg: 'Error al añadir métrica', type: 'error' });
        }
    };

    const handleDeleteKpi = async (id: string) => {
        if (confirm('¿Estás seguro de eliminar este registro?')) {
            const success = await deleteKPILog(id);
            if (success) {
                setKpiLogs(kpiLogs.filter(k => k.id !== id));
                setNotification({ msg: 'Registro eliminado', type: 'success' });
                setTimeout(() => setNotification(null), 3000);
            }
        }
    };



    if (loading) {
        return <div className="flex-1 flex items-center justify-center bg-background-light text-primary font-bold">Cargando...</div>;
    }

    const handleExportKpi = () => {
        if (kpiLogs.length === 0) return alert('No hay métricas para exportar.');
        const headers = ['ID', 'Fecha', 'Métrica', 'Valor', 'Notas'];
        const rows = kpiLogs.map(k => [k.id, new Date(k.created_at).toLocaleString(), k.metric_key, k.value, k.notes || '']);
        const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `kpi_metrics_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-background-light">
            <header className="sticky top-0 z-10 bg-background-light/95 px-8 py-6 border-b border-gray-200 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-[#111118] text-3xl font-extrabold leading-tight tracking-tight">Configuración</h2>
                    <p className="text-[#636388] text-sm font-medium">Configura las tarifas base y gestiona las métricas de rendimiento.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-6 py-2.5 bg-[#170c86] hover:bg-[#100c88] text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-900/20 hover:shadow-indigo-900/30 transition-all transform active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">save</span>
                        Guardar Cambios
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-background-light">
                <div className="max-w-[1400px] p-8 flex flex-col gap-8">
                    {notification && (
                        <div className={`p-4 rounded-lg flex items-center gap-3 animate-in slide-in-from-top-2 ${notification.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                            <span className="material-symbols-outlined">{notification.type === 'success' ? 'check_circle' : 'error'}</span>
                            <span className="font-bold">{notification.msg}</span>
                        </div>
                    )}

                    <div className="bg-white rounded-xl border border-[#dcdbe6] shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-[#dcdbe6] bg-gray-50/50 flex justify-between items-center"><span className="text-[#111118] font-bold text-lg">Configuración de Tarifa Estándar</span><div className="text-[#636189] text-sm flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">public</span> Zona Global</div></div>
                        <div className="p-8">
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="flex-1 w-full group">
                                    <label className="block mb-2"><span className="text-[#111118] text-base font-bold flex items-center gap-2">Tarifa Base ($) <span className="material-symbols-outlined text-gray-400 text-[18px] cursor-help">info</span></span></label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><span className="text-[#636189] font-bold text-lg">$</span></div>
                                        <input
                                            className="w-full h-14 pl-10 pr-4 bg-white border border-[#dcdbe6] rounded-lg text-[#111118] text-xl font-medium placeholder-[#636189] focus:outline-none focus:ring-2 focus:ring-[#170c86] focus:border-transparent transition-all group-hover:border-gray-400"
                                            step="0.50"
                                            type="number"
                                            value={baseRate}
                                            onChange={(e) => setBaseRate(parseFloat(e.target.value))}
                                        />
                                    </div>
                                </div>
                                <div className="flex-1 w-full group">
                                    <label className="block mb-2"><span className="text-[#111118] text-base font-bold flex items-center gap-2">Precio por KM ($) <span className="material-symbols-outlined text-gray-400 text-[18px] cursor-help">info</span></span></label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><span className="text-[#636189] font-bold text-lg">$</span></div>
                                        <input
                                            className="w-full h-14 pl-10 pr-4 bg-white border border-[#dcdbe6] rounded-lg text-[#111118] text-xl font-medium placeholder-[#636189] focus:outline-none focus:ring-2 focus:ring-[#170c86] focus:border-transparent transition-all group-hover:border-gray-400"
                                            step="0.10"
                                            type="number"
                                            value={kmRate}
                                            onChange={(e) => setKmRate(parseFloat(e.target.value))}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col md:flex-row gap-8 items-start mt-6">
                                <div className="flex-1 w-full group">
                                    <label className="block mb-2"><span className="text-[#111118] text-base font-bold flex items-center gap-2">Comisión Externa (%) <span className="material-symbols-outlined text-gray-400 text-[18px] cursor-help">info</span></span></label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><span className="text-[#636189] font-bold text-lg">%</span></div>
                                        <input
                                            className="w-full h-14 pl-10 pr-4 bg-white border border-[#dcdbe6] rounded-lg text-[#111118] text-xl font-medium placeholder-[#636189] focus:outline-none focus:ring-2 focus:ring-[#170c86] focus:border-transparent transition-all group-hover:border-gray-400"
                                            step="1.0"
                                            type="number"
                                            value={commissionRate}
                                            onChange={(e) => setCommissionRate(parseFloat(e.target.value))}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Porcentaje de comisión que Healthy Dream cobra a repartidores externos.</p>
                                    </div>
                                </div>
                                <div className="flex-1 w-full hidden md:block"></div> {/* Spacer */}
                            </div>
                        </div>
                    </div>

                    {/* KPI Management Section */}
                    <div className="bg-white rounded-xl border border-[#dcdbe6] shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-[#dcdbe6] bg-gray-50/50 flex justify-between items-center">
                            <span className="text-[#111118] font-bold text-lg">Historial y Gestión de Métricas (KPIs)</span>
                            <div className="flex items-center gap-4">
                                <button onClick={handleExportKpi} className="text-xs font-bold text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[16px]">download</span> CSV
                                </button>
                                <div className="text-[#636189] text-sm flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">show_chart</span> Métricas</div>
                            </div>
                        </div>
                        <div className="p-8 flex flex-col gap-6">

                            {/* Inputs for New KPI */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Métrica / Objetivo</label>
                                    <select
                                        className="w-full p-3 border border-gray-300 rounded-lg text-sm font-medium"
                                        value={newKpiKey}
                                        onChange={(e) => setNewKpiKey(e.target.value)}
                                    >
                                        <option value="monthly_revenue_target">Meta Ingresos Mensual</option>
                                        <option value="trip_count_target">Meta Cantidad Entregas</option>
                                        <option value="manual_adjustment">Ajuste Manual</option>
                                    </select>
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Valor</label>
                                    <input
                                        type="number"
                                        className="w-full p-3 border border-gray-300 rounded-lg text-sm font-medium"
                                        placeholder="0.00"
                                        value={newKpiValue}
                                        onChange={(e) => setNewKpiValue(parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Notas (Opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 border border-gray-300 rounded-lg text-sm font-medium"
                                        placeholder="Ej. Ajuste por temporada"
                                        value={newKpiNotes}
                                        onChange={(e) => setNewKpiNotes(e.target.value)}
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <button
                                        onClick={handleAddKpi}
                                        className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors flex justify-center items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-sm">add</span> Añadir Registro
                                    </button>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="w-full text-left text-sm text-gray-600">
                                    <thead className="bg-gray-100 text-gray-700 font-bold uppercase text-xs">
                                        <tr>
                                            <th className="p-4">Fecha</th>
                                            <th className="p-4">Métrica</th>
                                            <th className="p-4">Valor</th>
                                            <th className="p-4">Notas</th>
                                            <th className="p-4 text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {kpiLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4">{new Date(log.created_at).toLocaleString()}</td>
                                                <td className="p-4 font-medium text-gray-900">{log.metric_key}</td>
                                                <td className="p-4 font-bold text-primary">{formatCurrency(log.value)}</td>
                                                <td className="p-4 italic text-gray-500">{log.notes || '-'}</td>
                                                <td className="p-4 text-center">
                                                    <button
                                                        onClick={() => handleDeleteKpi(log.id)}
                                                        className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                                                        title="Eliminar"
                                                    >
                                                        <span className="material-symbols-outlined">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {kpiLogs.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="p-6 text-center text-gray-400 italic">No hay registros de métricas aún.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PricingSettings;