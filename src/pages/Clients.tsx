import React, { useState, useEffect } from 'react';
import { getBusinesses, addBusiness, updateBusiness, deleteBusiness, Business, getBusinessOriginsByBusiness, addBusinessOrigin, updateBusinessOrigin, deleteBusinessOrigin, BusinessOrigin } from '../services/dataService';
import { supabase } from '../services/supabaseClient';
import { pushToGoogleSheets } from '../services/googleSheetsService';

/**
 * Utility to extract coordinates from Google Maps URLs
 */
const extractCoordsFromLink = (url: string): string | null => {
    if (!url) return null;
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) return `${atMatch[1]}, ${atMatch[2]}`;
    const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) return `${qMatch[1]}, ${qMatch[2]}`;
    const llMatch = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (llMatch) return `${llMatch[1]}, ${llMatch[2]}`;
    const generalMatch = url.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (generalMatch && (url.includes('google.com/maps') || url.includes('goo.gl/maps'))) {
        return `${generalMatch[1]}, ${generalMatch[2]}`;
    }
    return null;
};

const Clients = () => {
    const [clients, setClients] = useState<Business[]>([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        type: 'Fisica',
        name: '',
        phone: '',
        email: '',
        rfc: '',
        address: '',
        locationLink: '',
        coords: '',
        baseRate0to6: '',
        baseRate6to15: '',
        extraKmRate: '',
        waitRatePerMin: '',
        routeType: ''
    });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 2000);
    };

    // SQL execution state - Temporary wrapper to create table if not exists locally
    const [isTableCreated, setIsTableCreated] = useState(false);

    // --- Business Origins Modal State ---
    const [isOriginsModalOpen, setIsOriginsModalOpen] = useState(false);
    const [activeBusinessForOrigins, setActiveBusinessForOrigins] = useState<Business | null>(null);
    const [originsLoading, setOriginsLoading] = useState(false);
    const [businessOrigins, setBusinessOrigins] = useState<BusinessOrigin[]>([]);
    const [editingOriginId, setEditingOriginId] = useState<string | null>(null);
    const [originFormData, setOriginFormData] = useState({
        name: '',
        address: '',
        coords: ''
    });

    useEffect(() => {
        // Attempt to create table silently on load (will fail gracefully if already exists or no permission, but good for local dev setup)
        const initTable = async () => {
            try {
                // If the user has execute_sql RPC, we use it. Otherwise, assume they created it.
                await supabase.rpc('execute_sql', {
                    sql_query: `
                        CREATE TABLE IF NOT EXISTS public.business_origins (
                            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                            business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
                            name VARCHAR NOT NULL,
                            address TEXT,
                            lat DECIMAL(10, 6) NOT NULL,
                            lng DECIMAL(10, 6) NOT NULL,
                            created_at TIMESTAMPTZ DEFAULT NOW()
                        );
                        ALTER TABLE public.business_origins ENABLE ROW LEVEL SECURITY;
                        DROP POLICY IF EXISTS "Enable read access for all users" ON public.business_origins;
                        CREATE POLICY "Enable read access for all users" ON public.business_origins FOR SELECT USING (true);
                        DROP POLICY IF EXISTS "Enable insert for all users" ON public.business_origins;
                        CREATE POLICY "Enable insert for all users" ON public.business_origins FOR INSERT WITH CHECK (true);
                        DROP POLICY IF EXISTS "Enable update for all users" ON public.business_origins;
                        CREATE POLICY "Enable update for all users" ON public.business_origins FOR UPDATE USING (true) WITH CHECK (true);
                        DROP POLICY IF EXISTS "Enable delete for all users" ON public.business_origins;
                        CREATE POLICY "Enable delete for all users" ON public.business_origins FOR DELETE USING (true);
                    `
                });
                setIsTableCreated(true);
            } catch (e) {}
        };
        initTable();
        loadClients();
    }, []);

    const loadClients = async () => {
        setLoading(true);
        const data = await getBusinesses();
        setClients(data); 
        setLoading(false);
    };

    const handleSave = async (explicitRouteType?: 'Matutina' | 'Vespertina') => {
        if (!formData.name) return alert("Nombre requerido");

        // Parse coords
        let lat = 0, lng = 0;
        if (formData.coords) {
            const parts = formData.coords.split(',');
            if (parts.length === 2) {
                lat = Number(parts[0].trim());
                lng = Number(parts[1].trim());
            }
        }

        try {
            const payload = {
                name: formData.name,
                type: formData.type,
                location: formData.address,
                locationLink: formData.locationLink,
                lat,
                lng,
                phone: formData.phone,
                email: formData.email,
                rfc: formData.rfc,
                baseRate0to6: formData.baseRate0to6 ? Number(formData.baseRate0to6) : undefined,
                baseRate6to15: formData.baseRate6to15 ? Number(formData.baseRate6to15) : undefined,
                extraKmRate: formData.extraKmRate ? Number(formData.extraKmRate) : undefined,
                waitRatePerMin: formData.waitRatePerMin ? Number(formData.waitRatePerMin) : undefined,
                routeType: explicitRouteType || (formData.routeType as any) || undefined
            };

            if (editingId) {
                await updateBusiness({ id: editingId, ...payload });
                showToast('Cliente actualizado exitosamente');
            } else {
                await addBusiness(payload);
                
                // Push to Google Sheets if it's a new business with a specific route (Non-blocking)
                if (payload.routeType) {
                    pushToGoogleSheets(payload.routeType as 'Matutina' | 'Vespertina', {
                        name: payload.name,
                        phone: payload.phone || '',
                        address: payload.location || '',
                        locationLink: payload.locationLink || '',
                        coords: formData.coords || ''
                    });
                }
                
                showToast('Cliente guardado exitosamente');
            }

            await loadClients();
            setFormData({ type: 'Fisica', name: '', phone: '', email: '', rfc: '', address: '', locationLink: '', coords: '', baseRate0to6: '', baseRate6to15: '', extraKmRate: '', waitRatePerMin: '', routeType: '' });
            setEditingId(null);
        } catch (error: any) {
            console.error(error);
            const msg = error.message || error.details || JSON.stringify(error);
            alert('Error al guardar cliente: ' + msg);
        }
    };

    const handleEdit = (client: Business) => {
        setEditingId(client.id);
        setFormData({
            type: client.type || 'Fisica',
            name: client.name,
            phone: client.phone || '',
            email: client.email || '',
            rfc: client.rfc || '',
            address: client.location || '',
            locationLink: client.locationLink || '',
            coords: client.lat && client.lng ? `${client.lat}, ${client.lng}` : '',
            baseRate0to6: client.baseRate0to6?.toString() || '',
            baseRate6to15: client.baseRate6to15?.toString() || '',
            extraKmRate: client.extraKmRate?.toString() || '',
            waitRatePerMin: client.waitRatePerMin?.toString() || '',
            routeType: client.routeType || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (confirm('¿Estás seguro de eliminar este cliente?')) {
            try {
                const res = await deleteBusiness(id);
                if (res.success) {
                    loadClients();
                } else {
                    alert(`Error al eliminar el cliente:\n${res.message || 'Verifica la consola.'}\n\nNota: Es probable que tenga dependencias.`);
                }
            } catch (err: any) {
                console.error('Delete error:', err);
                alert('Error al eliminar: ' + (err.message || JSON.stringify(err)));
            }
        }
    };

    // --- Business Origins Functions ---
    const openOriginsModal = async (business: Business) => {
        setActiveBusinessForOrigins(business);
        setIsOriginsModalOpen(true);
        setOriginsLoading(true);
        const fetchedOrigins = await getBusinessOriginsByBusiness(business.id);
        setBusinessOrigins(fetchedOrigins);
        setOriginsLoading(false);
        resetOriginForm();
    };

    const resetOriginForm = () => {
        setOriginFormData({ name: '', address: '', coords: '' });
        setEditingOriginId(null);
    };

    const handleEditOrigin = (origin: BusinessOrigin) => {
        setEditingOriginId(origin.id);
        setOriginFormData({
            name: origin.name,
            address: origin.address,
            coords: `${origin.lat}, ${origin.lng}`
        });
    };

    const handleDeleteOrigin = async (id: string) => {
        if (!confirm('¿Seguro de eliminar este origen rápido?')) return;
        const res = await deleteBusinessOrigin(id);
        if (res) {
            if (activeBusinessForOrigins) {
                const fetchedOrigins = await getBusinessOriginsByBusiness(activeBusinessForOrigins.id);
                setBusinessOrigins(fetchedOrigins);
            }
        } else {
            alert('Error al eliminar origen');
        }
    };

    const handleSaveOrigin = async () => {
        if (!originFormData.name || !originFormData.coords) {
            return alert('Nombre y Coordenadas son requeridos');
        }
        if (!activeBusinessForOrigins) return;

        let lat = 0, lng = 0;
        const parts = originFormData.coords.split(',');
        if (parts.length === 2) {
            lat = Number(parts[0].trim());
            lng = Number(parts[1].trim());
        }

        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
            return alert('Las coordenadas deben tener un formato válido: Latitud, Longitud');
        }

        try {
            if (editingOriginId) {
                await updateBusinessOrigin({
                    id: editingOriginId,
                    businessId: activeBusinessForOrigins.id,
                    name: originFormData.name,
                    address: originFormData.address,
                    lat,
                    lng,
                    createdAt: '' // not needed for update
                });
            } else {
                await addBusinessOrigin({
                    businessId: activeBusinessForOrigins.id,
                    name: originFormData.name,
                    address: originFormData.address,
                    lat,
                    lng
                });
            }
            const fetchedOrigins = await getBusinessOriginsByBusiness(activeBusinessForOrigins.id);
            setBusinessOrigins(fetchedOrigins);
            resetOriginForm();
        } catch (e) {
            console.error(e);
            alert('Error al guardar el origen rápido. ¿Ya se creó la tabla en la base de datos?');
        }
    };

    const handleExportCSV = () => {
        if (clients.length === 0) return alert('No hay clientes para exportar.');
        const headers = ['ID', 'Tipo', 'Nombre', 'Teléfono', 'Email', 'RFC', 'Ubicación', 'Latitud', 'Longitud'];
        const rows = clients.map(c => [c.id, c.type, c.name, c.phone, c.email || '', c.rfc || '', c.location, c.lat, c.lng]);
        const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `clientes_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex-1 bg-slate-50 p-6 overflow-y-auto h-full">
            <div className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-800">Clientes</h2>
                        <p className="text-slate-500">Gestión de clientes del sistema</p>
                    </div>
                    <div className="flex gap-4 items-center">
                        <button onClick={handleExportCSV} className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-slate-50 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">download</span> Exportar CSV
                        </button>
                        <button onClick={() => {
                            setEditingId(null);
                            setFormData({ type: 'Fisica', name: '', phone: '', email: '', rfc: '', address: '', locationLink: '', coords: '', baseRate0to6: '', baseRate6to15: '', extraKmRate: '', waitRatePerMin: '' });
                        }} className="text-xs text-blue-600 hover:underline">
                            Limpiar Formulario
                        </button>
                    </div>
                </div>

                {/* Formulario */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
                    <div className="flex justify-between items-center border-b pb-2 mb-4">
                        <h3 className="font-bold text-lg text-slate-800">
                            {editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
                        </h3>
                        {editingId && (
                            <button onClick={() => {
                                setEditingId(null);
                                setFormData({ type: 'Fisica', name: '', phone: '', email: '', rfc: '', address: '', locationLink: '', coords: '', baseRate0to6: '', baseRate6to15: '', extraKmRate: '', waitRatePerMin: '' });
                            }} className="text-xs font-bold text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                                Cancelar Edición
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Tipo</label>
                            <select
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                                className="w-full border rounded p-2 text-sm bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="Fisica">Persona Física</option>
                                <option value="Moral">Persona Moral</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Nombre / Razón Social</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Ej: Hotel Safy"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono</label>
                            <input
                                type="text"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Ej: 81 1234 5678"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="correo@empresa.com"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">RFC</label>
                            <input
                                type="text"
                                value={formData.rfc}
                                onChange={e => setFormData({ ...formData, rfc: e.target.value.toUpperCase() })}
                                className="w-full border rounded p-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="XAXX010101000"
                                maxLength={13}
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded border border-slate-200">
                        <h4 className="text-xs font-bold text-blue-800 mb-2">Ubicación del Cliente</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                            <input
                                type="text"
                                placeholder="Calle, Número, Colonia, Municipio"
                                value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                                className="col-span-3 border border-slate-300 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button className="bg-blue-600 text-white rounded p-2 text-sm font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">search</span> Buscar
                            </button>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Link de Ubicación (Google Maps)</label>
                            <input
                                type="text"
                                value={formData.locationLink}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const coords = extractCoordsFromLink(val);
                                    setFormData(prev => ({ 
                                        ...prev, 
                                        locationLink: val, 
                                        coords: coords || prev.coords 
                                    }));
                                }}
                                className="w-full border border-slate-300 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-2"
                                placeholder="Pega el link de Google Maps aquí"
                            />
                            <div className="flex gap-2 mb-2">
                                <button 
                                    onClick={() => {
                                        if (!formData.locationLink) return alert('Ingresa un link primero');
                                        window.open(formData.locationLink, '_blank');
                                    }}
                                    className="flex-1 py-2 bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 rounded text-[10px] font-bold uppercase tracking-wider transition-all"
                                >
                                    Ir al link
                                </button>
                            </div>
                            <div className="flex justify-between items-end mb-1">
                                <label className="block text-xs font-bold text-slate-500">Coordenadas (Lat, Long)</label>
                                <button 
                                    onClick={() => {
                                        if (!formData.address) return alert('Ingresa una dirección primero');
                                        const geocoder = new google.maps.Geocoder();
                                        geocoder.geocode({ address: formData.address }, (results, status) => {
                                            if (status === 'OK' && results && results[0]) {
                                                const loc = results[0].geometry.location;
                                                setFormData(prev => ({ ...prev, coords: `${loc.lat().toFixed(6)}, ${loc.lng().toFixed(6)}` }));
                                            } else {
                                                alert('No se pudo encontrar la ubicación de esa dirección');
                                            }
                                        });
                                    }}
                                    className="text-[10px] text-blue-600 hover:underline font-bold"
                                >
                                    Detectar por Dirección
                                </button>
                            </div>
                            <input
                                type="text"
                                value={formData.coords}
                                onChange={e => setFormData({ ...formData, coords: e.target.value })}
                                className="w-full border border-slate-300 rounded p-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Ej: 25.6866, -100.3161"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Ingresa manual o pega un link arriba para auto-detectar.</p>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded border border-blue-100 mt-4">
                        <h4 className="text-xs font-bold text-blue-800 mb-3 flex items-center gap-1 uppercase tracking-wider">
                            <span className="material-symbols-outlined text-[16px]">payments</span> Tarifas Especiales (Sustituyen Banderazo)
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Básica 0-6km</label>
                                <input
                                    type="number"
                                    value={formData.baseRate0to6}
                                    onChange={e => setFormData({ ...formData, baseRate0to6: e.target.value })}
                                    className="w-full border border-blue-200 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="Ej: 100"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Básica 6-15km</label>
                                <input
                                    type="number"
                                    value={formData.baseRate6to15}
                                    onChange={e => setFormData({ ...formData, baseRate6to15: e.target.value })}
                                    className="w-full border border-blue-200 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="Ej: 250"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Km Extra (+15km)</label>
                                <input
                                    type="number"
                                    value={formData.extraKmRate}
                                    onChange={e => setFormData({ ...formData, extraKmRate: e.target.value })}
                                    className="w-full border border-blue-200 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="Ej: 15"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Espera/Min ($)</label>
                                <input
                                    type="number"
                                    value={formData.waitRatePerMin}
                                    onChange={e => setFormData({ ...formData, waitRatePerMin: e.target.value })}
                                    className="w-full border border-blue-200 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="Ej: 2"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex gap-2 justify-end">
                        {editingId ? (
                            <button onClick={() => handleSave()} className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded font-bold shadow flex items-center gap-2 transition-colors">
                                <span className="material-symbols-outlined text-[18px]">save</span>
                                Actualizar Cliente
                            </button>
                        ) : (
                            <>
                                <button onClick={() => handleSave('Matutina')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold shadow flex items-center gap-2 transition-colors">
                                    <span className="material-symbols-outlined text-[18px]">wb_twilight</span>
                                    Guardar en Ruta Matutina
                                </button>
                                <button onClick={() => handleSave('Vespertina')} className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded font-bold shadow flex items-center gap-2 transition-colors">
                                    <span className="material-symbols-outlined text-[18px]">wb_sunny</span>
                                    Guardar en Ruta Vespertina
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Tabla */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-3">Tipo</th>
                                <th className="p-3">Nombre</th>
                                <th className="p-3">Teléfono</th>
                                <th className="p-3">Email</th>
                                <th className="p-3">RFC</th>
                                <th className="p-3">Ubicación</th>
                                <th className="p-3">Tarifas (0-6 / 6-15 / +Km / Espera)</th>
                                <th className="p-3 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                            {loading ? (
                                <tr><td colSpan={7} className="p-8 text-center">Cargando...</td></tr>
                            ) : clients.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-400">
                                        No hay clientes registrados.
                                    </td>
                                </tr>
                            ) : (
                                clients.map(client => (
                                    <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${client.type === 'Moral' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {client.type}
                                            </span>
                                        </td>
                                        <td className="p-3 font-bold">{client.name}</td>
                                        <td className="p-3 font-mono text-xs">{client.phone || '—'}</td>
                                        <td className="p-3 text-xs">{client.email || '—'}</td>
                                        <td className="p-3 font-mono text-xs">{client.rfc || '—'}</td>
                                        <td className="p-3">
                                            <div className="text-xs truncate max-w-[150px]" title={client.location}>{client.location || '—'}</div>
                                            {client.locationLink && (
                                                <a href={client.locationLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5">
                                                    <span className="material-symbols-outlined text-[12px]">map</span> Ver Mapa
                                                </a>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <div className="flex gap-1 flex-wrap">
                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600">${client.baseRate0to6 || 0}</span>
                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600">${client.baseRate6to15 || 0}</span>
                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-600">${client.extraKmRate || 0}</span>
                                                <span className="bg-amber-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-700">${client.waitRatePerMin || 0}/min</span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => openOriginsModal(client)} className="text-purple-600 hover:text-purple-800 p-1 flex items-center gap-1 bg-purple-50 hover:bg-purple-100 rounded px-2" title="Orígenes Rápidos">
                                                    <span className="material-symbols-outlined text-[16px]">location_on</span>
                                                </button>
                                                <button onClick={() => handleEdit(client)} className="text-blue-500 hover:text-blue-700 p-1" title="Editar"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                                                <button onClick={() => handleDelete(client.id)} className="text-red-500 hover:text-red-700 p-1" title="Eliminar"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Origins Modal */}
            {isOriginsModalOpen && activeBusinessForOrigins && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Orígenes Rápidos</h3>
                                <p className="text-sm text-gray-500">Para el cliente: <span className="font-bold text-gray-700">{activeBusinessForOrigins.name}</span></p>
                            </div>
                            <button onClick={() => setIsOriginsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <span className="material-symbols-outlined font-bold text-2xl">close</span>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-5">
                            {/* Form */}
                            <div className="bg-purple-50/50 p-4 rounded-lg border border-purple-100 mb-6">
                                <h4 className="font-bold text-purple-800 text-sm mb-3">
                                    {editingOriginId ? 'Editar Origen' : 'Agregar Nuevo Origen'}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Nombre Identificador *</label>
                                        <input 
                                            type="text" 
                                            className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" 
                                            placeholder="Ej: Sucursal Centro"
                                            value={originFormData.name}
                                            onChange={e => setOriginFormData({...originFormData, name: e.target.value})}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Coordenadas (Lat, Long) *</label>
                                        <input 
                                            type="text" 
                                            className="w-full border border-gray-200 rounded p-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-500" 
                                            placeholder="25.6866, -100.3161"
                                            value={originFormData.coords}
                                            onChange={e => setOriginFormData({...originFormData, coords: e.target.value})}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Dirección Completa (Opcional)</label>
                                        <input 
                                            type="text" 
                                            className="w-full border border-gray-200 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" 
                                            placeholder="Calle, Colonia, etc."
                                            value={originFormData.address}
                                            onChange={e => setOriginFormData({...originFormData, address: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    {editingOriginId && (
                                        <button onClick={resetOriginForm} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded font-bold">
                                            Cancelar
                                        </button>
                                    )}
                                    <button onClick={handleSaveOrigin} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded text-sm font-bold shadow-sm transition-colors flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[16px]">{editingOriginId ? 'save' : 'add'}</span>
                                        {editingOriginId ? 'Actualizar' : 'Agregar'}
                                    </button>
                                </div>
                            </div>

                            {/* List */}
                            <div>
                                <h4 className="font-bold text-gray-700 text-sm mb-3">Orígenes Guardados</h4>
                                {originsLoading ? (
                                    <p className="text-sm text-gray-500 italic">Cargando...</p>
                                ) : businessOrigins.length === 0 ? (
                                    <p className="text-sm text-gray-400 bg-gray-50 p-4 rounded text-center border border-dashed">
                                        No hay orígenes registrados para este cliente.
                                    </p>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {businessOrigins.map(origin => (
                                            <div key={origin.id} className="flex justify-between items-center bg-white border border-gray-200 p-3 rounded-lg shadow-sm hover:border-purple-200 transition-colors">
                                                <div>
                                                    <div className="font-bold text-gray-800 text-sm flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[16px] text-purple-600">bolt</span>
                                                        {origin.name}
                                                    </div>
                                                    {origin.address && <div className="text-xs text-gray-500 mt-0.5">{origin.address}</div>}
                                                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">{origin.lat}, {origin.lng}</div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => handleEditOrigin(origin)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded transition-colors" title="Editar">
                                                        <span className="material-symbols-outlined text-[18px]">edit</span>
                                                    </button>
                                                    <button onClick={() => handleDeleteOrigin(origin.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors" title="Eliminar">
                                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300`}>
                    <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl shadow-2xl border backdrop-blur-md ${
                        toast.type === 'error' ? 'bg-red-500/90 border-red-400 text-white' : 
                        toast.type === 'info' ? 'bg-blue-500/90 border-blue-400 text-white' :
                        'bg-green-500/90 border-green-400 text-white'
                    }`}>
                        <span className="material-symbols-outlined text-[20px]">
                            {toast.type === 'error' ? 'error' : toast.type === 'info' ? 'info' : 'check_circle'}
                        </span>
                        <p className="text-sm font-bold tracking-tight">{toast.message}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Clients;
