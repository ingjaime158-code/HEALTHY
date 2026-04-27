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
    const [activeMetric, setActiveMetric] = useState<'totalKm' | 'routeKm' | 'customers'>('routeKm');

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
        return data.map(d => {
            const totalKm = d.records ? d.records.reduce((sum, r) => sum + (r.totalKm || 0), 0) : 0;
            const routeKm = d.records ? d.records.reduce((sum, r) => sum + (r.routeKm || 0), 0) : 0;
            const customers = d.records ? d.records.reduce((sum, r) => sum + (r.customers || 0), 0) : 0;
            const efficiency = customers > 0 ? parseFloat((routeKm / customers).toFixed(1)) : 0;
            return {
                date: d.date ? d.date.split(' ').pop() : '?',
                totalKm,
                routeKm,
                customers
            };
        });
    }, [data]);

    const driverChartData = useMemo(() => {
        const drivers: { [key: string]: { name: string, value: number } } = {};
        data.flatMap(d => d.records || []).forEach(r => {
            if (!r.driver) return;
            if (!drivers[r.driver]) {
                drivers[r.driver] = { name: r.driver, value: 0 };
            }
            
            if (activeMetric === 'totalKm') drivers[r.driver].value += (r.totalKm || 0);
            else if (activeMetric === 'routeKm') drivers[r.driver].value += (r.routeKm || 0);
            else if (activeMetric === 'customers') drivers[r.driver].value += (r.customers || 0);
        });

        return Object.values(drivers).sort((a, b) => b.value - a.value);
    }, [data, activeMetric]);

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

            {/* Rutas Recientes (Últimas 2 Capturas Completas) */}
            {data.length > 0 && (
                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="h-1 w-12 bg-blue-600 rounded-full"></div>
                        <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Últimas Rutas Capturadas</h2>
                    </div>
                    
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {[...data].reverse().slice(0, 2).map((route, idx) => (
                            <div key={idx} className="bg-white rounded-[2rem] shadow-xl shadow-blue-900/5 border border-slate-100 overflow-hidden transition-all hover:shadow-2xl hover:shadow-blue-900/10 hover:-translate-y-1">
                                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-white/80 text-xl">calendar_today</span>
                                        <h3 className="text-white font-black text-base uppercase tracking-tight">{route.date}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="bg-white/20 backdrop-blur-md text-white text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest border border-white/10">
                                            {idx === 0 ? 'Más Reciente' : 'Anterior'}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                                                    <th className="pb-3 text-left">Repartidor</th>
                                                    <th className="pb-3 text-right">KM Totales</th>
                                                    <th className="pb-3 text-right">KM Ruta</th>
                                                    <th className="pb-3 text-right">Total de Clientes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {route.records.map((r, ri) => (
                                                    <tr key={ri} className="group hover:bg-slate-50/80 transition-colors">
                                                        <td className="py-3 font-bold text-slate-700 flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                                            {r.driver}
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <span className="font-black text-emerald-600 text-sm bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100/50">
                                                                {r.totalKm}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <span className="font-black text-blue-600 text-sm bg-blue-50 px-2 py-1 rounded-lg">
                                                                {r.routeKm}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <span className="text-slate-900 font-black">{r.customers}</span>
                                                                <span className="text-[10px] font-bold text-slate-300">clientes</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    <div className="mt-6 pt-4 border-t border-slate-50 flex justify-between items-center">
                                        <div className="flex gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-300 uppercase">Total KM</span>
                                                <span className="text-xs font-bold text-slate-600">{route.records.reduce((s, r) => s + (r.routeKm || 0), 0)} km</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-300 uppercase">Total Clientes</span>
                                                <span className="text-xs font-bold text-slate-600">{route.records.reduce((s, r) => s + (r.customers || 0), 0)}</span>
                                            </div>
                                        </div>
                                        <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-slate-300 text-sm">info</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Stats as Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[
                    { id: 'totalKm', label: 'KM Totales', val: stats.totalKm.toLocaleString(), unit: 'km', icon: 'speed', color: 'emerald' },
                    { id: 'routeKm', label: 'KM en Ruta', val: stats.totalRouteKm.toLocaleString(), unit: 'km', icon: 'map', color: 'blue' },
                    { id: 'customers', label: 'Total de Clientes', val: stats.totalCustomers, unit: 'clientes', icon: 'groups', color: 'amber' },
                ].map((s) => (
                    <button 
                        key={s.id} 
                        onClick={() => setActiveMetric(s.id as any)}
                        className={`text-left p-5 rounded-2xl transition-all duration-300 border ${activeMetric === s.id 
                            ? `bg-white border-${s.color}-500 shadow-xl shadow-${s.color}-900/10 ring-2 ring-${s.color}-500/20 -translate-y-1` 
                            : 'bg-white border-slate-100 shadow-sm hover:border-slate-300 hover:shadow-md'}`}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <span className={`material-symbols-outlined text-${s.color}-600 bg-${s.color}-50 p-2 rounded-lg`}>{s.icon}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <h2 className="text-2xl font-black text-slate-900">{s.val}</h2>
                            <span className="text-xs font-bold text-slate-400">{s.unit}</span>
                        </div>
                    </button>
                ))}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl mb-6 font-bold flex items-center gap-3">
                    <span className="material-symbols-outlined">warning</span>
                    {error}
                </div>
            )}

            {viewMode === 'charts' ? (
                <div className="flex flex-col gap-8">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                        <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                            <span className="material-symbols-outlined text-blue-600 bg-blue-50 p-2 rounded-xl">show_chart</span>
                            Tendencia Diaria: {activeMetric === 'totalKm' ? 'KM Totales' : activeMetric === 'routeKm' ? 'KM en Ruta' : 'Total de Clientes'}
                        </h3>
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dailyChartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{fontSize: 11, fontWeight: 600, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <YAxis tick={{fontSize: 11, fontWeight: 600, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                                        itemStyle={{fontWeight: '900', fontSize: '14px'}}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey={activeMetric} 
                                        stroke={activeMetric === 'customers' ? '#f59e0b' : activeMetric === 'totalKm' ? '#10b981' : '#3b82f6'} 
                                        strokeWidth={4} 
                                        fill={activeMetric === 'customers' ? '#f59e0b' : activeMetric === 'totalKm' ? '#10b981' : '#3b82f6'} 
                                        fillOpacity={0.1} 
                                        name={activeMetric === 'totalKm' ? 'KM Totales' : activeMetric === 'routeKm' ? 'KM en Ruta' : 'Total de Clientes'} 
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                        <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                            <span className="material-symbols-outlined text-blue-600 bg-blue-50 p-2 rounded-xl">leaderboard</span>
                            Ranking por {activeMetric === 'totalKm' ? 'KM Totales' : activeMetric === 'routeKm' ? 'KM en Ruta' : 'Total de Clientes'}
                        </h3>
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={driverChartData} layout="vertical" margin={{ left: 40, right: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12, fontWeight: 800, fill: '#1e293b'}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                                    />
                                    <Bar dataKey="value" fill={activeMetric === 'customers' ? '#f59e0b' : activeMetric === 'totalKm' ? '#10b981' : '#3b82f6'} radius={[0, 10, 10, 0]} name={activeMetric === 'totalKm' ? 'KM Totales' : activeMetric === 'routeKm' ? 'KM en Ruta' : 'Total de Clientes'}>
                                        <LabelList dataKey="value" position="right" style={{ fontSize: '12px', fontWeight: '900', fill: '#1e293b' }} />
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
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Total de Clientes</th>
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
