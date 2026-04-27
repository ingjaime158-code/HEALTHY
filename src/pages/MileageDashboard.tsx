import React, { useEffect, useState, useMemo } from 'react';
import { fetchMileageData, DaySummary, MileageRecord } from '../services/mileageService';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    LineChart, Line, Legend, AreaChart, Area 
} from 'recharts';
import { 
    Route, 
    Users, 
    TrendingUp, 
    Calendar, 
    ChevronDown, 
    FileSpreadsheet, 
    Download,
    BarChart3,
    Table as TableIcon
} from 'lucide-react';

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
                setData(result);
                setError(null);
            } catch (err) {
                console.error(err);
                setError('Error al cargar los datos de kilometraje.');
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [selectedMonth]);

    // Computed Stats
    const stats = useMemo(() => {
        const allRecords = data.flatMap(d => d.records);
        const totalKm = allRecords.reduce((sum, r) => sum + r.totalKm, 0);
        const totalRouteKm = allRecords.reduce((sum, r) => sum + r.routeKm, 0);
        const totalCustomers = allRecords.reduce((sum, r) => sum + r.customers, 0);
        const avgKmPerCustomer = totalCustomers > 0 ? (totalRouteKm / totalCustomers).toFixed(1) : 0;

        return { totalKm, totalRouteKm, totalCustomers, avgKmPerCustomer };
    }, [data]);

    // Chart Data: KM by Day
    const dailyChartData = useMemo(() => {
        return data.map(d => ({
            date: d.date.split(' ')[1], // Just the date part
            totalKm: d.records.reduce((sum, r) => sum + r.totalKm, 0),
            routeKm: d.records.reduce((sum, r) => sum + r.routeKm, 0)
        }));
    }, [data]);

    // Chart Data: KM by Driver
    const driverChartData = useMemo(() => {
        const drivers: { [key: string]: { name: string, total: number, route: number } } = {};
        data.flatMap(d => d.records).forEach(r => {
            if (!drivers[r.driver]) {
                drivers[r.driver] = { name: r.driver, total: 0, route: 0 };
            }
            drivers[r.driver].total += r.totalKm;
            drivers[r.driver].route += r.routeKm;
        });
        return Object.values(drivers).sort((a, b) => b.route - a.route);
    }, [data]);

    if (loading) {
        return (
            <div className="flex flex-col h-full w-full items-center justify-center bg-slate-50 gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                <p className="text-slate-500 font-medium">Analizando historial de kilómetros...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-[#f8fafc] overflow-y-auto custom-scrollbar p-6">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
                            <Route size={28} />
                        </div>
                        Historial de Kilómetros
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">Análisis de rendimiento y recorridos de la flota</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <select 
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="appearance-none pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                        >
                            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-slate-600 transition-colors" size={18} />
                    </div>

                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                        <button 
                            onClick={() => setViewMode('charts')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'charts' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Ver Gráficas"
                        >
                            <BarChart3 size={20} />
                        </button>
                        <button 
                            onClick={() => setViewMode('table')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="Ver Tabla"
                        >
                            <TableIcon size={20} />
                        </button>
                    </div>

                    <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-md active:scale-95">
                        <Download size={18} />
                        Exportar
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <TrendingUp size={20} />
                        </div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">KM Totales</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-3xl font-black text-slate-900">{stats.totalKm.toLocaleString()}</h2>
                        <span className="text-sm font-bold text-slate-400 italic">km</span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Route size={20} />
                        </div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">KM en Ruta</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-3xl font-black text-slate-900">{stats.totalRouteKm.toLocaleString()}</h2>
                        <span className="text-sm font-bold text-slate-400 italic">km</span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <Users size={20} />
                        </div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clientes Atendidos</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-3xl font-black text-slate-900">{stats.totalCustomers}</h2>
                        <span className="text-sm font-bold text-slate-400 italic">entregas</span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                            <TrendingUp size={20} />
                        </div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">KM / Cliente</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-3xl font-black text-slate-900">{stats.avgKmPerCustomer}</h2>
                        <span className="text-sm font-bold text-slate-400 italic">km prom.</span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl mb-6 font-bold flex items-center gap-3">
                    <span className="material-symbols-outlined">error</span>
                    {error}
                </div>
            )}

            {viewMode === 'charts' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Daily Trend Chart */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <TrendingUp size={20} className="text-blue-600" />
                            Tendencia Diaria (Km)
                        </h3>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dailyChartData}>
                                    <defs>
                                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis 
                                        dataKey="date" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}}
                                        dy={10}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}}
                                    />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                    />
                                    <Area type="monotone" dataKey="totalKm" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" name="KM Totales" />
                                    <Area type="monotone" dataKey="routeKm" stroke="#10b981" strokeWidth={3} fillOpacity={0} name="KM en Ruta" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Driver Comparison Chart */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Users size={20} className="text-blue-600" />
                            Recorrido por Repartidor
                        </h3>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={driverChartData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{fontSize: 11, fill: '#1e293b', fontWeight: 700}}
                                        width={80}
                                    />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="route" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} name="KM en Ruta" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            ) : (
                /* Table View */
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-8">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Fecha / Turno</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Repartidor</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">KM Totales</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">KM en Ruta</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Clientes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {data.flatMap((day, dIdx) => 
                                    day.records.map((record, rIdx) => (
                                        <tr key={`${dIdx}-${rIdx}`} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-4">
                                                <span className={`text-xs font-black px-2 py-1 rounded-md ${day.date.startsWith('RV') ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {day.date}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-700">{record.driver}</td>
                                            <td className="px-6 py-4 text-right font-mono text-slate-500">{record.totalKm}</td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">{record.routeKm}</td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                                    {record.customers} pts
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="mt-auto py-6 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                    <FileSpreadsheet size={14} />
                    Fuente: Google Sheets ID: {SHEET_ID.substring(0, 10)}...
                </div>
                <div className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">
                    Healthy Dream Logistics Engine • v1.0
                </div>
            </div>
        </div>
    );
};

export default MileageDashboard;
