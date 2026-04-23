import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface Lead {
    id: string;
    created_at: string;
    contact_name: string;
    contact_email: string;
    company_name?: string;
    company_address?: string;
    service_type: string;
    message_details: string;
}

const Leads = () => {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeads();
    }, []);

    const fetchLeads = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) {
            setLeads(data);
        }
        setLoading(false);
    };

    const handleExportCSV = () => {
        if (leads.length === 0) return alert('No hay solicitudes para exportar.');
        const headers = ['ID', 'Fecha', 'Nombre', 'Email', 'Empresa', 'Dirección', 'Servicio', 'Detalles'];
        const rows = leads.map(l => [l.id, new Date(l.created_at).toLocaleString(), l.contact_name, l.contact_email, l.company_name || '', l.company_address || '', l.service_type, l.message_details]);
        const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `leads_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Solicitudes de Contacto</h1>
                    <p className="text-slate-500">Gestión de leads y requerimientos desde Landing Page</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <span className="material-symbols-outlined text-[18px]">download</span> CSV
                    </button>
                    <button
                        onClick={fetchLeads}
                        className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
                        title="Actualizar"
                    >
                        <span className="material-symbols-outlined">refresh</span>
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contacto</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Empresa / Dirección</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Servicio</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Detalles</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500">Cargando solicitudes...</td>
                                </tr>
                            ) : leads.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500">No hay solicitudes registradas aún.</td>
                                </tr>
                            ) : (
                                leads.map((lead) => (
                                    <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 text-sm text-slate-500 whitespace-nowrap">
                                            {new Date(lead.created_at).toLocaleDateString()} <br />
                                            <span className="text-xs opacity-70">{new Date(lead.created_at).toLocaleTimeString()}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="font-bold text-slate-900 text-sm">{lead.contact_name}</div>
                                            <div className="text-xs text-slate-500">{lead.contact_email}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className="font-bold text-slate-900 text-sm">{lead.company_name || '-'}</div>
                                            <div className="text-xs text-slate-500 max-w-[200px] truncate" title={lead.company_address}>{lead.company_address || '-'}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                                                {lead.service_type}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-slate-600 max-w-xs truncate" title={lead.message_details}>
                                            {lead.message_details}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Leads;
