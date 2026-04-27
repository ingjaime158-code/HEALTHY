import React, { useEffect, useState, useMemo } from 'react';
import { fetchMileageData, DaySummary } from '../services/mileageService';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    AreaChart, Area, LabelList 
} from 'recharts';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril'];

const MileageDashboard: React.FC = () => {
    const [selectedMonth, setSelectedMonth] = useState('Abril');
    const [data, setData] = useState<DaySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'charts' | 'table'>('charts');

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const result = await fetchMileageData(selectedMonth);
                if (!result || result.length === 0) {
                    setData([]);
                } else {
                    setData(result);
                }
                setError(null);
            } catch (err) {
                console.error('Error loading mileage data:', err);
                setError('No se pudo conectar con la hoja de cálculo. Verifica que el archivo sea público.');
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [selectedMonth]);

    // Computed Stats safely
    const stats = useMemo(() => {
        const allRecords = data?.flatMap(d => d.records || []) || [];
        const totalKm = allRecords.reduce((sum, r) => sum + (r.totalKm || 0), 0);
        const totalRouteKm = allRecords.reduce((sum, r) => sum + (r.routeKm || 0), 0);
        const totalCustomers = allRecords.reduce((sum, r) => sum + (r.customers || 0), 0);
        const avgKmPerCustomer = totalCustomers > 0 ? (totalRouteKm / totalCustomers).toFixed(1) : "0";

        return { totalKm, totalRouteKm, totalCustomers, avgKmPerCustomer };
    }, [data]);

    // Chart Data safely
    const dailyChartData = useMemo(() => {
        return data.map(d => ({
            date: d.date ? d.date.split(' ').pop() : '?',
            totalKm: d.records ? d.records.reduce((sum, r) => sum + (r.totalKm || 0), 0) : 0,
            routeKm: d.records ? d.records.reduce((sum, r) => sum + (r.routeKm || 0), 0) : 0
        }));
    }, [data]);

    const driverChartData = useMemo(() => {
        const drivers: { [key: string]: { name: string, route: number } } = {};
        data.flatMap(d => d.records || []).forEach(r => {
            if (!r.driver) return;
            if (!drivers[r.driver]) {
                drivers[r.driver] = { name: r.driver, route: 0 };
            }
            drivers[r.driver].route += (r.routeKm || 0);
        });
        return Object.values(drivers).sort((a, b) => b.route - a.route);
    }, [data]);

    if (loading) {
        return (
            <div className="flex flex-col h-full w-full items-center justify-center bg-slate-50 gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                <p className="text-slate-500 font-bold">Cargando Historial...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-[#f8fafc] overflow-y-auto p-4 md:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-blue-600 bg-blue-50 p-2 rounded-2xl shadow-sm">route</span>
                        Historial de Kilómetros
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 ml-1">Análisis de rendimiento y recorridos de la flota</p>
                </div>

                <div className="flex items-center gap-3">
                    <select 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>

                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                        <button 
                            onClick={() => setViewMode('charts')}
                            className={`p-2 rounded-lg transition-all flex items-center ${viewMode === 'charts' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                        >
                            <span className="material-symbols-outlined">bar_chart</span>
                        </button>
                        <button 
                            onClick={() => setViewMode('table')}
                            className={`p-2 rounded-lg transition-all flex items-center ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                        >
                            <span className="material-symbols-outlined">table_chart</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'KM Totales', val: stats.totalKm.toLocaleString(), unit: 'km', icon: 'speed', color: 'emerald' },
                    { label: 'KM en Ruta', val: stats.totalRouteKm.toLocaleString(), unit: 'km', icon: 'map', color: 'blue' },
                    { label: 'Entregas', val: stats.totalCustomers, unit: 'pts', icon: 'package', color: 'amber' },
                    { label: 'Eficiencia', val: stats.avgKmPerCustomer, unit: 'km/ent', icon: 'query_stats', color: 'purple' }
                ].map((s, i) => (
                    <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex items-center gap-3 mb-3">
                            <span className={`material-symbols-outlined text-${s.color}-600 bg-${s.color}-50 p-2 rounded-lg`}>{s.icon}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <h2 className="text-2xl font-black text-slate-900">{s.val}</h2>
                            <span className="text-xs font-bold text-slate-400">{s.unit}</span>
                        </div>
                    </div>
                ))}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl mb-6 font-bold flex items-center gap-3">
                    <span className="material-symbols-outlined">warning</span>
                    {error}
                </div>
            )}

            {viewMode === 'charts' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-blue-600">show_chart</span>
                            Tendencia de KM
                        </h3>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dailyChartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <YAxis tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                                        itemStyle={{fontWeight: 'bold', fontSize: '12px'}}
                                    />
                                    <Area type="monotone" dataKey="totalKm" stroke="#3b82f6" strokeWidth={3} fill="#3b82f6" fillOpacity={0.1} name="KM Totales" />
                                    <Area type="monotone" dataKey="routeKm" stroke="#10b981" strokeWidth={3} fill="none" name="KM en Ruta" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-blue-600">leaderboard</span>
                            KM por Repartidor
                        </h3>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={driverChartData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11, fontWeight: 700}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                                    />
                                    <Bar dataKey="route" fill="#3b82f6" radius={[0, 4, 4, 0]} name="KM en Ruta">
                                        <LabelList dataKey="route" position="right" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Repartidor</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">KM Ruta</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Clientes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {data.flatMap((day, dIdx) => 
                                    day.records.map((record, rIdx) => (
                                        <tr key={`${dIdx}-${rIdx}`} className="hover:bg-blue-50/50">
                                            <td className="px-6 py-4 font-mono text-[10px]">{day.date}</td>
                                            <td className="px-6 py-4 font-bold text-slate-700">{record.driver}</td>
                                            <td className="px-6 py-4 text-right font-black text-blue-600">{record.routeKm}</td>
                                            <td className="px-6 py-4 text-right text-slate-500 font-bold">{record.customers}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MileageDashboard;
