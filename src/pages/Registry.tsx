import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    getBusinesses, addBusiness, updateBusiness, deleteBusiness,
    getUnits, addUnit, updateUnit, deleteUnit,
    getDrivers, addDriver, updateDriver, deleteDriver, getUnitName,
    getAdministrators, addAdministrator, updateAdministrator, deleteAdministrator,
    getDestinations as getRouteMaps, addDestination as addRouteMap, updateDestination as updateRouteMap, deleteDestination as deleteRouteMap,
    Business, FleetUnit, Driver, Administrator, RouteMap, initializeData
} from '../services/dataService';
import { addAllowedUser } from '../services/authService';

const Registry = () => {
    const navigate = useNavigate();
    const { tab, action, id } = useParams();

    const tabMap: Record<string, 'businesses' | 'units' | 'drivers' | 'administrators' | 'maps'> = {
        'negocios': 'businesses',
        'unidades': 'units',
        'choferes': 'drivers',
        'administradores': 'administrators',
        'mapas': 'maps',
    };
    const [activeTab, setActiveTab] = useState<'businesses' | 'units' | 'drivers' | 'administrators' | 'maps'>(tab ? tabMap[tab] || 'businesses' : 'businesses');

    // Data State
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [units, setUnits] = useState<FleetUnit[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [administrators, setAdministrators] = useState<Administrator[]>([]);
    const [maps, setMaps] = useState<RouteMap[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null); // Track item being edited

    // State for Country Codes (defaults)
    const [bizPhonePrefix, setBizPhonePrefix] = useState('+52');
    const [unitManagerPrefix, setUnitManagerPrefix] = useState('+52');
    const [unitReceptionistPrefix, setUnitReceptionistPrefix] = useState('+52');
    const [driverPhonePrefix, setDriverPhonePrefix] = useState('+52');
    const [adminPhonePrefix, setAdminPhonePrefix] = useState('+52');

    // Form States
    const [bizForm, setBizForm] = useState({ name: '', type: 'Hotel', location: '', lat: 25.6866, lng: -100.3161, phone: '', rfc: '', coordsInput: '25.6866, -100.3161', parentId: '', isBranch: false, baseRate0to6: '', baseRate6to15: '', extraKmRate: '', waitRatePerMin: '' });
    const [pendingBranches, setPendingBranches] = useState<any[]>([]); // Batch registration
    const [unitForm, setUnitForm] = useState({ name: '', managerName: '', managerNumber: '', receptionistNumber: '', location: '', lat: 25.6750, lng: -100.3200, coordsInput: '25.6750, -100.3200', isOwn: false });
    const [driverForm, setDriverForm] = useState({ name: '', phoneNumber: '', password: '', morningSheetUrl: '', eveningSheetUrl: '', morningMyMapsUrl: '', eveningMyMapsUrl: '', unitId: '' });
    const [adminForm, setAdminForm] = useState({ name: '', phone: '', email: '', password: '', role: 'Administrador', businessId: '' });
    const [mapForm, setMapForm] = useState({ name: '', morningMapUrl: '', eveningMapUrl: '' });

    const countryCodes = [
        { code: '+52', country: 'MX' },
        { code: '+1', country: 'US/CA' },
        { code: '+34', country: 'ES' },
        { code: '+57', country: 'CO' },
        { code: '+54', country: 'AR' },
        { code: '+56', country: 'CL' },
        { code: '+502', country: 'GT' },
    ];

    useEffect(() => {
        const init = async () => {
            initializeData();
            await refreshData();
            setLoading(false);
        };
        init();
    }, []);

    // Sync URL with State
    useEffect(() => {
        if (loading) return; // Wait for data

        // 1. TABS

        if (tab && tabMap[tab]) {
            setActiveTab(tabMap[tab]);
        } else {
            // Default if valid tab not present, maybe redirect or just set state defaults? 
            // Let's stick to 'businesses' default but no redirect here to avoid fighting
            if (!tab) setActiveTab('businesses');
        }

        // 2. MODALS
        if (action === 'nuevo') {
            handleOpenModalInternal(false); // false = don't set editingId null immediately if we were editing? No, new means new.
        } else if (action === 'editar' && id) {
            // Find item based on current mapped tab (or URL tab)
            const currentTabKey = tab ? tabMap[tab] : 'businesses';

            // Logic to find item and call handleEditInternal
            let itemToEdit = null;
            let type: 'business' | 'unit' | 'driver' | 'admin' | 'map' = 'business';

            if (currentTabKey === 'businesses') { itemToEdit = businesses.find(b => b.id === id); type = 'business'; }
            else if (currentTabKey === 'units') { itemToEdit = units.find(u => u.id === id); type = 'unit'; }
            else if (currentTabKey === 'drivers') { itemToEdit = drivers.find(d => d.id === id); type = 'driver'; }
            else if (currentTabKey === 'administrators') { itemToEdit = administrators.find(a => a.id === id); type = 'admin'; }
            else if (currentTabKey === 'maps') { itemToEdit = maps.find(m => m.id === id); type = 'map'; }

            if (itemToEdit) {
                handleEditInternal(itemToEdit, type);
            }
        } else {
            // No action -> Close modal
            if (isModalOpen) handleCloseModalInternal();
        }

    }, [tab, action, id, loading, businesses, units, drivers, administrators, maps]);

    const refreshData = async () => {
        const [b, u, d, a, m] = await Promise.all([
            getBusinesses(),
            getUnits(),
            getDrivers(),
            getAdministrators(),
            getRouteMaps()
        ]);
        setBusinesses(b);
        setUnits(u);
        setDrivers(d);
        setAdministrators(a);
        setMaps(m);
    };

    const getCurrentTabPath = () => {
        if (activeTab === 'businesses') return 'negocios';
        if (activeTab === 'units') return 'unidades';
        if (activeTab === 'drivers') return 'choferes';
        if (activeTab === 'administrators') return 'administradores';
        if (activeTab === 'maps') return 'mapas';
        return 'negocios';
    };

    const handleOpenModalInternal = (reset = true) => {
        setIsModalOpen(true);
        setEditingId(null); // Default to Create mode

        // Reset forms based on active tab
        if (reset) {
            setBizForm({ name: '', type: 'Hotel', location: '', lat: 25.6866, lng: -100.3161, phone: '', rfc: '', coordsInput: '', parentId: '', isBranch: false, baseRate0to6: '', baseRate6to15: '', extraKmRate: '', waitRatePerMin: '' });
            setPendingBranches([]);
            setUnitForm({ name: '', managerName: '', managerNumber: '', receptionistNumber: '', location: '', lat: 25.6750, lng: -100.3200, coordsInput: '', isOwn: false });
            setDriverForm({ name: '', phoneNumber: '', password: '', morningSheetUrl: '', eveningSheetUrl: '', morningMyMapsUrl: '', eveningMyMapsUrl: '', unitId: units.length > 0 ? units[0].id : '' });
            setAdminForm({ name: '', phone: '', email: '', password: '', role: 'Administrador', businessId: '' });
            setMapForm({ name: '', morningMapUrl: '', eveningMapUrl: '' });

            // Reset prefixes
            setBizPhonePrefix('+52');
            setUnitManagerPrefix('+52');
            setUnitReceptionistPrefix('+52');
            setDriverPhonePrefix('+52');
            setAdminPhonePrefix('+52');
        }
    };

    const handleCloseModalInternal = () => {
        setIsModalOpen(false);
        setEditingId(null);
    };

    // Helper to split phone number for editing
    const splitPhone = (fullPhone: string | undefined) => {
        if (!fullPhone) return { prefix: '+52', number: '' };
        // Sort by length desc to match longest prefix first (e.g. +502 vs +5)
        const sortedCodes = [...countryCodes].sort((a, b) => b.code.length - a.code.length);
        const match = sortedCodes.find(c => fullPhone.startsWith(c.code));
        if (match) {
            return { prefix: match.code, number: fullPhone.slice(match.code.length) };
        }
        return { prefix: '+52', number: fullPhone };
    };

    const handleEditInternal = (item: any, type: 'business' | 'unit' | 'driver' | 'admin' | 'map') => {
        setEditingId(item.id);

        if (type === 'business') {
            const { prefix, number } = splitPhone(item.phone);
            setBizPhonePrefix(prefix);
            setBizForm({
                name: item.name,
                type: item.type,
                location: item.location,
                lat: item.lat,
                lng: item.lng,
                phone: number,
                rfc: item.rfc || '',
                coordsInput: `${item.lat}, ${item.lng}`,
                parentId: item.parentId || '',
                isBranch: !!item.parentId,
                baseRate0to6: item.baseRate0to6?.toString() || '',
                baseRate6to15: item.baseRate6to15?.toString() || '',
                extraKmRate: item.extraKmRate?.toString() || '',
                waitRatePerMin: item.waitRatePerMin?.toString() || ''
            });
        }
        if (type === 'unit') {
            const mgr = splitPhone(item.managerNumber);
            const rec = splitPhone(item.receptionistNumber);
            setUnitManagerPrefix(mgr.prefix);
            setUnitReceptionistPrefix(rec.prefix);
            setUnitForm({
                name: item.name,
                managerName: item.managerName,
                managerNumber: mgr.number,
                receptionistNumber: rec.number,
                location: item.location,
                lat: item.lat,
                lng: item.lng,
                coordsInput: `${item.lat}, ${item.lng}`,
                isOwn: item.isOwn || false
            });
        }
        if (type === 'driver') {
            const { prefix, number } = splitPhone(item.phoneNumber);
            setDriverPhonePrefix(prefix);
            setDriverForm({
                name: item.name,
                phoneNumber: number,
                morningSheetUrl: item.morningSheetUrl || '',
                eveningSheetUrl: item.eveningSheetUrl || '',
                morningMyMapsUrl: item.morningMyMapsUrl || '',
                eveningMyMapsUrl: item.eveningMyMapsUrl || '',
                password: item.password || '',
                unitId: item.unitId
            });
        }
        if (type === 'admin') {
            const { prefix, number } = splitPhone(item.phone);
            setAdminPhonePrefix(prefix);
            setAdminForm({ name: item.name, phone: number });
        }
        if (type === 'destination') {
            setDestinationForm({
                name: item.name,
                address: item.address || '',
                lat: item.lat || 25.6866,
                lng: item.lng || -100.3161,
                coordsInput: `${item.lat}, ${item.lng}`
            });
        }

        setIsModalOpen(true);
    };

    const handleBusinessSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // 1. Batch Submission (Pending Branches)
        if (pendingBranches.length > 0) {
            try {
                // If there is leftover data in the form that looks valid (has name), ask or auto-add?
                // For safety, we only submit the verified list. The user should have clicked "Add" for the last one.
                if (bizForm.name.trim()) {
                    if (window.confirm('Tienes datos en el formulario que no has añadido a la lista. ¿Deseas añadirlos y guardar todo?')) {
                        const fullPhone = bizForm.phone ? `${bizPhonePrefix}${bizForm.phone}` : '';
                        pendingBranches.push({ ...bizForm, phone: fullPhone });
                    }
                }

                for (const branch of pendingBranches) {
                    await addBusiness(branch);
                }

                alert(`${pendingBranches.length} sucursales registradas exitosamente.`);
            } catch (err) {
                console.error(err);
                alert('Error al guardar algunas sucursales.');
            }
        }
        // 2. Single Submission (Normal)
        else {
            try {
                const fullPhone = bizForm.phone ? `${bizPhonePrefix}${bizForm.phone}` : '';
                const submission = { ...bizForm, phone: fullPhone };

                if (editingId) {
                    await updateBusiness({ ...submission, id: editingId });
                } else {
                    await addBusiness(submission);
                }
            } catch (err: any) {
                console.error('Error in handleBusinessSubmit:', err);
                return alert(`Error al guardar negocio: ${err.message || 'Verifica la consola.'}`);
            }
        }

        await refreshData();
        navigate(`/registry/${getCurrentTabPath()}`);
    };

    const handleUnitSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const fullManagerPhone = unitForm.managerNumber ? `${unitManagerPrefix}${unitForm.managerNumber}` : '';
            const fullReceptionistPhone = unitForm.receptionistNumber ? `${unitReceptionistPrefix}${unitForm.receptionistNumber}` : '';

            const submission = {
                ...unitForm,
                managerNumber: fullManagerPhone,
                receptionistNumber: fullReceptionistPhone
            };

            if (editingId) {
                await updateUnit({ ...submission, id: editingId });
            } else {
                await addUnit(submission);
            }
            await refreshData();
            navigate(`/registry/${getCurrentTabPath()}`);
        } catch (err: any) {
            console.error('Error in handleUnitSubmit:', err);
            alert(`Error al guardar base: ${err.message || 'Verifica la consola.'}`);
        }
    };

    const handleDriverSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const fullPhone = driverForm.phoneNumber ? `${driverPhonePrefix}${driverForm.phoneNumber}` : '';
            const submission = { ...driverForm, phoneNumber: fullPhone };

            if (editingId) {
                await updateDriver({ ...submission, id: editingId });
            } else {
                await addDriver(submission);
            }
            await refreshData();
            navigate(`/registry/${getCurrentTabPath()}`);
        } catch (err: any) {
            console.error('Error in handleDriverSubmit:', err);
            alert(`Error al guardar repartidor: ${err.message || 'Verifica la consola.'}`);
        }
    };

    const handleAdminSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const fullPhone = adminForm.phone ? `${adminPhonePrefix}${adminForm.phone}` : '';

            // Handle Auth User Creation for Comerciante
            if (adminForm.role === 'Comerciante' && !editingId) {
                if (!adminForm.businessId) return alert('Debes seleccionar una empresa para el comerciante.');
                if (!adminForm.email) return alert('Email es requerido para el acceso del comerciante.');

                // OAuth only - no password passed
                const authSuccess = await addAllowedUser(adminForm.email, undefined, 'Comerciante', adminForm.businessId);
                if (!authSuccess) return alert('Error al crear el usuario de acceso. El email podría estar en uso.');
            }

            if (editingId) {
                await updateAdministrator({ ...adminForm, phone: fullPhone, id: editingId, createdAt: '' });
            } else {
                await addAdministrator({ ...adminForm, phone: fullPhone });
            }
            await refreshData();
            navigate(`/registry/${getCurrentTabPath()}`);
        } catch (err: any) {
            console.error('Error in handleAdminSubmit:', err);
            alert(`Error al guardar usuario/administrador: ${err.message || 'Verifica la consola.'}`);
        }
    };

    const handleDelete = async (id: string, type: 'business' | 'unit' | 'driver' | 'admin' | 'destination') => {
        if (!window.confirm('¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.')) return;

        let res: { success: boolean, message?: string } = { success: false, message: 'Tipo de registro no válido' };
        if (type === 'business') res = await deleteBusiness(id);
        if (type === 'unit') res = await deleteUnit(id);
        if (type === 'driver') res = await deleteDriver(id);
        if (type === 'admin') res = await deleteAdministrator(id);
        if (type === 'map') res = await deleteRouteMap(id);

        if (res.success) {
            await refreshData();
        } else {
            alert(`Error al eliminar el registro:\n${res.message || 'Verifica la consola para más detalles.'}\n\nNota: Es posible que este registro tenga dependencias (por ejemplo entregas, usuarios, sucursales, o repartidores atados a él).`);
        }
    };

    const getUnitNameAsync = (unitId: string) => {
        const unit = units.find(u => u.id === unitId);
        return unit ? unit.name : 'Unknown Unit';
    };

    const parseCoords = (input: string) => {
        const parts = input.split(',').map(s => s.trim());
        if (parts.length === 2) {
            const lat = parseFloat(parts[0]);
            const lng = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lng)) {
                return { lat, lng };
            }
        }
        return null;
    };

    const handleBizCoordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const parsed = parseCoords(val);
        setBizForm(prev => ({
            ...prev,
            coordsInput: val,
            ...(parsed ? parsed : {})
        }));
    };

    const handleUnitCoordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const parsed = parseCoords(val);
        setUnitForm(prev => ({
            ...prev,
            coordsInput: val,
            ...(parsed ? parsed : {})
        }));
    };


    const handleDestinationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                await updateDestination({ id: editingId, ...destinationForm });
            } else {
                await addDestination(destinationForm);
            }
            handleCloseModalInternal();
            await refreshData();
        } catch (error) {
            console.error('Error saving destination:', error);
            alert('Error al guardar el destino/punto de interés.');
        }
    };

    const handleMapSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                await updateRouteMap({ id: editingId, name: mapForm.name || 'Mapas Maestros', morningMapUrl: mapForm.morningMapUrl, eveningMapUrl: mapForm.eveningMapUrl });
            } else {
                await addRouteMap({ name: mapForm.name || 'Mapas Maestros', morningMapUrl: mapForm.morningMapUrl, eveningMapUrl: mapForm.eveningMapUrl });
            }
            handleCloseModalInternal();
            await refreshData();
        } catch (error) {
            console.error('Error saving map:', error);
            alert('Error al guardar el mapa.');
        }
    };

    const handleExportCSV = () => {
        let headers: string[] = [];
        let rows: any[][] = [];
        let filename = `registro_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;

        if (activeTab === 'businesses') {
            headers = ['ID', 'Nombre', 'Tipo', 'Ubicación', 'RFC', 'Sucursal de'];
            // Filter out commercial clients
            const regBiz = businesses.filter(b => b.type !== 'Fisica' && b.type !== 'Moral');
            rows = regBiz.map(b => [b.id, b.name, b.type, b.location, b.rfc || '', b.parentId ? businesses.find(p => p.id === b.parentId)?.name || b.parentId : 'Matriz']);
        } else if (activeTab === 'units') {
            headers = ['ID', 'Nombre', 'Encargado', 'Teléfono Encargado', 'Ubicación', 'Base Propia'];
            rows = units.map(u => [u.id, u.name, u.managerName, u.managerNumber, u.location, u.isOwn ? 'Sí' : 'No']);
        } else if (activeTab === 'drivers') {
            headers = ['ID', 'Nombre', 'Teléfono', 'Hoja Matutina', 'Hoja Vespertina', 'Mapa Matutino', 'Mapa Vespertino'];
            rows = drivers.map(d => [d.id, d.name, d.phoneNumber, d.morningSheetUrl || '', d.eveningSheetUrl || '', d.morningMyMapsUrl || '', d.eveningMyMapsUrl || '']);
        } else if (activeTab === 'administrators') {
            headers = ['ID', 'Nombre', 'Teléfono', 'Email', 'Rol', 'Empresa'];
            rows = administrators.map(a => [a.id, a.name, a.phone, a.email, a.role, a.businessId ? businesses.find(b => b.id === a.businessId)?.name || '' : '']);
        } else if (activeTab === 'maps') {
            headers = ['ID', 'Nombre', 'Mapa Matutino', 'Mapa Vespertino'];
            rows = maps.map(m => [m.id, m.name, m.morningMapUrl || '', m.eveningMapUrl || '']);
        }

        if (rows.length === 0) return alert('No hay datos para exportar.');

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(item => `"${String(item || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background-light relative">
            <header className="sticky top-0 z-10 bg-background-light/95 px-8 py-6 border-b border-gray-200 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-[#111118] text-3xl font-extrabold leading-tight tracking-tight">
                        {activeTab === 'businesses' ? 'Negocios' : activeTab === 'units' ? 'Bases' : activeTab === 'drivers' ? 'Repartidores' : activeTab === 'maps' ? 'Mapas de Rutas' : 'Master'}
                    </h2>
                    <p className="text-[#636388] text-sm font-medium">
                        {activeTab === 'businesses' ? 'Administra hoteles y negocios asociados.' :
                            activeTab === 'units' ? 'Gestiona las bases de la flota.' :
                                activeTab === 'drivers' ? 'Administra el padrón de repartidores.' :
                                    activeTab === 'maps' ? 'Gestiona los mapas de las rutas matutinas y vespertinas.' :
                                        'Gestiona los accesos de administradores del sistema.'}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 h-10 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <span className="material-symbols-outlined text-[18px]">download</span> Exportar CSV
                    </button>
                    {(activeTab !== 'maps' || maps.length === 0) && (
                        <button
                            onClick={() => navigate(`/registry/${getCurrentTabPath()}/nuevo`)}
                            className="flex items-center gap-2 px-4 h-10 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm hover:shadow-md"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>add</span>
                            Agregar {activeTab === 'businesses' ? 'Negocio' : activeTab === 'units' ? 'Base' : activeTab === 'drivers' ? 'Repartidor' : activeTab === 'administrators' ? 'Administrador' : activeTab === 'maps' ? 'Mapa' : ''}
                        </button>
                    )}                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-[1400px] mx-auto flex flex-col gap-6 h-full">
                    <div className="bg-white rounded-xl border border-[#e5e7eb] shadow-sm flex flex-col flex-1 min-h-[600px]">
                        {/* Tab navigation removed to separate views */}

                        <div className="flex-1 overflow-x-auto">
                            {loading ? <div className="p-8 text-center text-gray-400">Cargando registros...</div> : (
                                <>
                                    {activeTab === 'businesses' && (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider w-8"></th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Nombre del Negocio</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Giro / Categoría</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Ubicación</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider w-28">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#f0f0f4]">
                                                {businesses.filter(b => !b.parentId && b.type !== 'Fisica' && b.type !== 'Moral').map(biz => {
                                                    const branches = businesses.filter(b => b.parentId === biz.id && b.type !== 'Fisica' && b.type !== 'Moral');
                                                    const hasBranches = branches.length > 0;

                                                    return (
                                                        <React.Fragment key={biz.id}>
                                                            <tr className="group hover:bg-[#f9fafb]">
                                                                <td className="py-4 px-6 text-center">
                                                                    {hasBranches && (
                                                                        <span className="material-symbols-outlined text-gray-400 text-sm cursor-help" title={`${branches.length} sucursales`}>
                                                                            hub
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="py-4 px-6 text-sm font-bold text-[#121118]">
                                                                    {biz.name}
                                                                    {hasBranches && <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{branches.length} Sucursales</span>}
                                                                </td>
                                                                <td className="py-4 px-6 text-sm text-[#656189]">{biz.type}</td>
                                                                <td className="py-4 px-6 text-sm text-[#121118] font-medium">{biz.location}</td>
                                                                <td className="py-4 px-6 flex gap-2">
                                                                    <button onClick={() => navigate(`/registry/negocios/editar/${biz.id}`)} className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 transition-colors" title="Editar y Ver Sucursales">
                                                                        <span className="material-symbols-outlined text-[20px]">edit_square</span>
                                                                    </button>
                                                                    <button onClick={() => handleDelete(biz.id, 'business')} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors" title="Eliminar">
                                                                        <span className="material-symbols-outlined text-[20px]">delete</span>
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            {/* Render Branches Accordion-style (Always visible for now or indented) */}
                                                            {branches.map(branch => (
                                                                <tr key={branch.id} className="bg-gray-50/50 hover:bg-gray-50">
                                                                    <td className="py-2 px-6"></td>
                                                                    <td className="py-2 px-6 pl-10 text-xs font-medium text-gray-600 flex items-center gap-2">
                                                                        <span className="material-symbols-outlined text-[14px] text-gray-400">subdirectory_arrow_right</span>
                                                                        {branch.name}
                                                                    </td>
                                                                    <td className="py-2 px-6 text-xs text-gray-500">{branch.type}</td>
                                                                    <td className="py-2 px-6 text-xs text-gray-500">{branch.location}</td>
                                                                    <td className="py-2 px-6 flex gap-2">
                                                                        <button onClick={() => navigate(`/registry/negocios/editar/${branch.id}`)} className="text-blue-400 hover:text-blue-600 p-1" title="Editar Sucursal">
                                                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}

                                    {/* ... Units, Drivers, Admins tables (omitted for brevity, they remain similar) ... */}
                                    {/* NOTE: Units/Drivers/etc blocks follow here, make sure not to cut them off improperly if using simple replace. I will assume I am replacing the Table block only */}
                                    {/* Actually, the Replace tool requires precise matching. I will target the TAB CONTENT for activeTab === 'businesses' specifically. */}


                                    {activeTab === 'units' && (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Nombre Base</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Encargado</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Contacto</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Ubicación</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider w-28">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#f0f0f4]">
                                                {units.map(unit => (
                                                    <tr key={unit.id} className="group hover:bg-[#f9fafb]">
                                                        <td className="py-4 px-6 text-sm font-bold text-[#121118]">{unit.name}</td>
                                                        <td className="py-4 px-6 text-sm text-[#656189]">{unit.managerName}</td>
                                                        <td className="py-4 px-6 text-sm text-[#656189]">{unit.managerNumber} {unit.receptionistNumber && `/ ${unit.receptionistNumber}`}</td>
                                                        <td className="py-4 px-6 text-sm text-[#121118] font-medium">{unit.location}</td>
                                                        <td className="py-4 px-6 flex gap-2">
                                                            <button onClick={() => navigate(`/registry/unidades/editar/${unit.id}`)} className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 transition-colors" title="Editar">
                                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                                            </button>
                                                            <button onClick={() => handleDelete(unit.id, 'unit')} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors" title="Eliminar">
                                                                <span className="material-symbols-outlined text-[20px]">delete</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    {activeTab === 'drivers' && (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Nombre Repartidor</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Teléfono</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Ruta Matutina</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Ruta Vespertina</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Mapa Matutino</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Mapa Vespertino</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider w-28">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#f0f0f4]">
                                                {drivers.map(driver => (
                                                    <tr key={driver.id} className="group hover:bg-[#f9fafb]">
                                                        <td className="py-4 px-6 text-sm font-bold text-[#121118]">{driver.name}</td>
                                                        <td className="py-4 px-6 text-sm text-[#656189]">{driver.phoneNumber}</td>
                                                        <td className="py-4 px-6">
                                                            {driver.morningSheetUrl ? (
                                                                <a href={driver.morningSheetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1 text-xs">
                                                                    <span className="material-symbols-outlined text-[14px]">description</span> Ver Hoja
                                                                </a>
                                                            ) : <span className="text-gray-400 text-xs">N/A</span>}
                                                        </td>
                                                        <td className="py-4 px-6">
                                                            {driver.eveningSheetUrl ? (
                                                                <a href={driver.eveningSheetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1 text-xs">
                                                                    <span className="material-symbols-outlined text-[14px]">description</span> Ver Hoja
                                                                </a>
                                                            ) : <span className="text-gray-400 text-xs">N/A</span>}
                                                        </td>
                                                        <td className="py-4 px-6">
                                                            {driver.morningMyMapsUrl ? (
                                                                <a href={driver.morningMyMapsUrl} target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline flex items-center gap-1 text-xs font-bold">
                                                                    <span className="material-symbols-outlined text-[14px]">map</span> Matutino
                                                                </a>
                                                            ) : <span className="text-gray-400 text-xs">N/A</span>}
                                                        </td>
                                                        <td className="py-4 px-6">
                                                            {driver.eveningMyMapsUrl ? (
                                                                <a href={driver.eveningMyMapsUrl} target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline flex items-center gap-1 text-xs font-bold">
                                                                    <span className="material-symbols-outlined text-[14px]">map</span> Vespertino
                                                                </a>
                                                            ) : <span className="text-gray-400 text-xs">N/A</span>}
                                                        </td>
                                                        <td className="py-4 px-6 flex gap-2">
                                                            <button onClick={() => navigate(`/registry/choferes/editar/${driver.id}`)} className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 transition-colors" title="Editar">
                                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                                            </button>
                                                            <button onClick={() => handleDelete(driver.id, 'driver')} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors" title="Eliminar">
                                                                <span className="material-symbols-outlined text-[20px]">delete</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    {activeTab === 'administrators' && (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Nombre</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Teléfono</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Fecha Registro</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider w-28">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#f0f0f4]">
                                                {administrators.map(admin => (
                                                    <tr key={admin.id} className="group hover:bg-[#f9fafb]">
                                                        <td className="py-4 px-6 text-sm font-bold text-[#121118]">{admin.name}</td>
                                                        <td className="py-4 px-6 text-sm text-[#656189]">{admin.phone}</td>
                                                        <td className="py-4 px-6 text-sm text-[#656189]">{new Date(admin.createdAt).toLocaleDateString()}</td>
                                                        <td className="py-4 px-6 flex gap-2">
                                                            <button onClick={() => navigate(`/registry/administradores/editar/${admin.id}`)} className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 transition-colors" title="Editar">
                                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                                            </button>
                                                            <button onClick={() => handleDelete(admin.id, 'admin')} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors" title="Eliminar">
                                                                <span className="material-symbols-outlined text-[20px]">delete</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    {activeTab === 'maps' && (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Nombre de Ruta</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Mapa Matutino</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider">Mapa Vespertino</th>
                                                    <th className="py-4 px-6 text-xs font-bold text-[#656189] uppercase tracking-wider w-28">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#f0f0f4]">
                                                {maps.map(m => (
                                                    <tr key={m.id} className="group hover:bg-[#f9fafb]">
                                                        <td className="py-4 px-6 text-sm font-bold text-[#121118]">{m.name}</td>
                                                        <td className="py-4 px-6 text-sm text-[#656189]">
                                                            {m.morningMapUrl ? (
                                                                <a href={m.morningMapUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-purple-600 hover:underline">
                                                                    <span className="material-symbols-outlined text-[16px]">map</span> Ver Mapa
                                                                </a>
                                                            ) : '-'}
                                                        </td>
                                                        <td className="py-4 px-6 text-sm text-[#656189]">
                                                            {m.eveningMapUrl ? (
                                                                <a href={m.eveningMapUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-orange-600 hover:underline">
                                                                    <span className="material-symbols-outlined text-[16px]">map</span> Ver Mapa
                                                                </a>
                                                            ) : '-'}
                                                        </td>
                                                        <td className="py-4 px-6 flex gap-2">
                                                            <button onClick={() => navigate(`/registry/mapas/editar/${m.id}`)} className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 transition-colors" title="Editar">
                                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>


            {/* Modal Overlay */}
            {
                isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <h3 className="text-lg font-bold text-[#111118]">
                                    {editingId ? 'Editar ' : 'Registrar Nuevo '}
                                    {activeTab === 'businesses' && 'Negocio'}
                                    {activeTab === 'units' && 'Unidad'}
                                    {activeTab === 'drivers' && 'Repartidor'}
                                    {activeTab === 'administrators' && 'Administrador'}
                                    {activeTab === 'destinations' && 'Destino'}
                                </h3>
                                <button onClick={() => navigate(`/registry/${getCurrentTabPath()}`)} className="text-gray-400 hover:text-gray-600"><span className="material-symbols-outlined">close</span></button>
                            </div>

                            {activeTab === 'businesses' && (
                                <form onSubmit={handleBusinessSubmit} className="p-6 flex flex-col gap-4">
                                    {/* Business Type Selector (Matriz / Sucursal) */}
                                    <div className="flex gap-4 p-1 bg-gray-100 rounded-lg w-fit">
                                        <button
                                            type="button"
                                            onClick={() => setBizForm({ ...bizForm, isBranch: false, parentId: '' })}
                                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${!bizForm.isBranch ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            Empresa Matriz
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBizForm({ ...bizForm, isBranch: true })}
                                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${bizForm.isBranch ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            Sucursal / Filial
                                        </button>
                                    </div>

                                    {/* Parent Selector (Only if Sucursal) */}
                                    {bizForm.isBranch && (
                                        <div className="animate-in fade-in slide-in-from-top-2">
                                            <label className="block text-xs font-bold text-[#636388] mb-1">Empresa Matriz</label>
                                            <select
                                                required={bizForm.isBranch}
                                                className="w-full rounded-lg border-gray-300 text-sm focus:ring-primary focus:border-primary"
                                                value={bizForm.parentId}
                                                onChange={e => setBizForm({ ...bizForm, parentId: e.target.value })}
                                            >
                                                <option value="">Selecciona la empresa matriz</option>
                                                {businesses
                                                    .filter(b => b.id !== editingId && !b.parentId && b.type !== 'Fisica' && b.type !== 'Moral') // Prevent selecting self or another branch as parent (1 level deep for now)
                                                    .map(b => (
                                                        <option key={b.id} value={b.id}>{b.name}</option>
                                                    ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Registered Branches List (Only if Parent and Editing) */}
                                    {!bizForm.isBranch && editingId && (
                                        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-xs font-bold text-[#636388]">Sucursales Registradas</label>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        // Switch to "Add Branch" mode for this parent
                                                        handleCloseModalInternal(); // Close current modal to reset state properly
                                                        setTimeout(() => {
                                                            setIsModalOpen(true);
                                                            setEditingId(null);
                                                            setBizForm({
                                                                name: '',
                                                                type: bizForm.type, // Inherit type
                                                                location: '',
                                                                lat: 25.6866, lng: -100.3161,
                                                                phone: '',
                                                                rfc: '',
                                                                coordsInput: '',
                                                                parentId: editingId, // Link to this parent
                                                                isBranch: true
                                                            });
                                                        }, 50);
                                                    }}
                                                    className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">add</span>
                                                    Nueva Sucursal
                                                </button>
                                            </div>

                                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                                {businesses.filter(b => b.parentId === editingId && b.type !== 'Fisica' && b.type !== 'Moral').length === 0 ? (
                                                    <p className="text-[10px] text-gray-400 italic">No hay sucursales registradas.</p>
                                                ) : (
                                                    businesses.filter(b => b.parentId === editingId && b.type !== 'Fisica' && b.type !== 'Moral').map(branch => (
                                                        <div key={branch.id} className="flex justify-between items-center bg-white p-2 rounded border border-gray-100 shadow-sm">
                                                            <div className="truncate">
                                                                <p className="text-xs font-bold text-gray-700">{branch.name}</p>
                                                                <p className="text-[10px] text-gray-400 truncate">{branch.location}</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    handleCloseModalInternal();
                                                                    setTimeout(() => navigate(`/registry/negocios/editar/${branch.id}`), 50);
                                                                }}
                                                                className="p-1 hover:bg-gray-100 rounded text-blue-500"
                                                            >
                                                                <span className="material-symbols-outlined text-[16px]">edit</span>
                                                            </button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Pending Branches List (Batch Mode) */}
                                    {pendingBranches.length > 0 && (
                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 animate-in slide-in-from-top-2 mb-4">
                                            <h4 className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[16px]">playlist_add_check</span>
                                                Sucursales por Registrar ({pendingBranches.length})
                                            </h4>
                                            <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                                                {pendingBranches.map((pb, idx) => (
                                                    <div key={idx} className="flex justify-between items-center bg-white p-2 rounded shadow-sm border border-blue-100">
                                                        <div className="truncate flex-1">
                                                            <p className="text-xs font-bold text-gray-800">{pb.name}</p>
                                                            <p className="text-[10px] text-gray-500 truncate">{pb.location} • {pb.type}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingBranches(prev => prev.filter((_, i) => i !== idx))}
                                                            className="text-red-400 hover:text-red-600 p-1"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Nombre del Negocio {bizForm.isBranch && '(Sucursal)'} <span className="text-red-500">*</span></label>
                                        <input required type="text" className="w-full rounded-lg border-gray-300 text-sm" value={bizForm.name} onChange={e => setBizForm({ ...bizForm, name: e.target.value })} placeholder={bizForm.isBranch ? "Ej. Planta Norte" : "Ej. Grupo Industrial MTY"} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Sector / Giro</label>
                                        <select className="w-full rounded-lg border-gray-300 text-sm" value={bizForm.type} onChange={e => setBizForm({ ...bizForm, type: e.target.value })}>
                                            <optgroup label="Hospitalidad y Turismo">
                                                <option value="Hotel">Hotel</option>
                                                <option value="Restaurant">Restaurante / A&B</option>
                                                <option value="Bar">Bar / Vida Nocturna</option>
                                                <option value="Mall">Centro Comercial</option>
                                                <option value="Turismo">Agencia / Tours</option>
                                            </optgroup>
                                            <optgroup label="Manufactura e Industria">
                                                <option value="Manufactura - General">Manufactura General</option>
                                                <option value="Manufactura - Automotriz">Automotriz</option>
                                                <option value="Manufactura - Aeroespacial">Aeroespacial</option>
                                                <option value="Manufactura - Electrodomesticos">Electrodomésticos</option>
                                                <option value="Industrial - Metalmecanica">Metalmecánica</option>
                                                <option value="Industrial - Plasticos">Plásticos</option>
                                            </optgroup>
                                            <optgroup label="Textil y Confección">
                                                <option value="Textil - Maquila">Maquila (Ropa)</option>
                                                <option value="Textil - Uniformes">Uniformes Corporativos/Industriales</option>
                                                <option value="Textil - Blancos">Blancos / Hotelería</option>
                                            </optgroup>
                                            <optgroup label="Logística y Comercio">
                                                <option value="Logistica - CEDIS">Centro de Distribución (CEDIS)</option>
                                                <option value="Logistica - Transporte">Transportista</option>
                                                <option value="Retail - Tienda">Retail / Tienda Física</option>
                                                <option value="Comercio - Showroom">Showroom</option>
                                            </optgroup>
                                            <optgroup label="Servicios y Otros">
                                                <option value="Servicios - Corporativo">Oficinas Corporativas</option>
                                                <option value="Servicios - Call Center">Call Center / BPO</option>
                                                <option value="Tecnologia">Tecnología / Software</option>
                                                <option value="Construccion">Construcción</option>
                                                <option value="Salud">Salud / Hospitales</option>
                                                <option value="Educacion">Educación</option>
                                                <option value="Other">Otro</option>
                                            </optgroup>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">RFC (Registro Federal de Contribuyentes)</label>
                                        <input type="text" className="w-full rounded-lg border-gray-300 text-sm uppercase" value={bizForm.rfc || ''} onChange={e => setBizForm({ ...bizForm, rfc: e.target.value.toUpperCase() })} placeholder="XAXX010101000" maxLength={13} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Teléfono (WhatsApp)</label>
                                        <div className="flex gap-2">
                                            <select className="w-24 rounded-lg border-gray-300 text-sm" value={bizPhonePrefix} onChange={e => setBizPhonePrefix(e.target.value)}>
                                                {countryCodes.map(c => <option key={c.code} value={c.code}>{c.country} {c.code}</option>)}
                                            </select>
                                            <input required type="tel" className="flex-1 rounded-lg border-gray-300 text-sm" value={bizForm.phone || ''} onChange={e => setBizForm({ ...bizForm, phone: e.target.value })} placeholder="Número" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Ubicación (Dirección) <span className="text-red-500">*</span></label>
                                        <input required type="text" className="w-full rounded-lg border-gray-300 text-sm" value={bizForm.location} onChange={e => setBizForm({ ...bizForm, location: e.target.value })} placeholder="Calle, Número, Colonia" />
                                    </div>

                                    {/* Google Maps Coordinates Input */}
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Coordenadas (Pegar desde Google Maps)</label>
                                        <input
                                            required
                                            type="text"
                                            className="w-full rounded-lg border-gray-300 text-sm placeholder-gray-400 font-mono"
                                            value={bizForm.coordsInput}
                                            onChange={handleBizCoordsChange}
                                            placeholder="Ej. 25.684659, -100.226902"
                                        />
                                        <p className="text-[10px] text-gray-400 mt-1">
                                            Detectado: {bizForm.lat.toFixed(5)}, {bizForm.lng.toFixed(5)}
                                        </p>
                                    </div>
                                    
                                    {/* Specialized Rates for Commercial Clients */}
                                    <div className="grid grid-cols-2 gap-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                                        <div className="col-span-2">
                                            <label className="text-[10px] font-black text-blue-800 uppercase tracking-widest flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[14px]">payments</span> Tarifas Especiales (Crédito)
                                            </label>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Básica 0-6km</label>
                                            <input type="number" step="0.01" className="w-full rounded-lg border-gray-300 text-sm" value={bizForm.baseRate0to6} onChange={e => setBizForm({ ...bizForm, baseRate0to6: e.target.value })} placeholder="Ej. 100" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Básica 6-15km</label>
                                            <input type="number" step="0.01" className="w-full rounded-lg border-gray-300 text-sm" value={bizForm.baseRate6to15} onChange={e => setBizForm({ ...bizForm, baseRate6to15: e.target.value })} placeholder="Ej. 250" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Km Extra (+15)</label>
                                            <input type="number" step="0.01" className="w-full rounded-lg border-gray-300 text-sm" value={bizForm.extraKmRate} onChange={e => setBizForm({ ...bizForm, extraKmRate: e.target.value })} placeholder="Ej. 15" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Espera/Min ($)</label>
                                            <input type="number" step="0.01" className="w-full rounded-lg border-gray-300 text-sm" value={bizForm.waitRatePerMin} onChange={e => setBizForm({ ...bizForm, waitRatePerMin: e.target.value })} placeholder="Ej. 2" />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 mt-4">
                                        {/* Add to List Button (Batch Mode) */}
                                        {bizForm.isBranch && !editingId && (
                                            <button
                                                type='button'
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    // Validate required fields
                                                    if (!bizForm.name.trim() || !bizForm.location.trim()) {
                                                        alert('Por favor completa el Nombre y la Ubicación de la sucursal.');
                                                        return;
                                                    }
                                                    if (!bizForm.parentId) {
                                                        alert('Por favor selecciona una Empresa Matriz.');
                                                        return;
                                                    }

                                                    const fullPhone = bizForm.phone ? `${bizPhonePrefix}${bizForm.phone}` : '';
                                                    const newBranch = { ...bizForm, phone: fullPhone };

                                                    setPendingBranches(prev => [...prev, newBranch]);

                                                    // Reset form fields, explicitly keeping parentId & type
                                                    setBizForm(prev => ({
                                                        ...prev,
                                                        name: '',
                                                        location: '',
                                                        phone: '',
                                                        rfc: '',
                                                        coordsInput: ''
                                                    }));
                                                }}
                                                className="w-full py-2.5 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 border border-gray-200 border-dashed"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">add</span>
                                                Agregar Sucursal a la Lista
                                            </button>
                                        )}

                                        <button type="submit" className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm">
                                            {editingId ? 'Guardar Cambios' : pendingBranches.length > 0 ? `Registrar ${pendingBranches.length} Sucursales` : 'Registrar Negocio'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {activeTab === 'units' && (
                                <form onSubmit={handleUnitSubmit} className="p-6 flex flex-col gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Nombre de Base</label>
                                        <input required type="text" className="w-full rounded-lg border-gray-300 text-sm" value={unitForm.name} onChange={e => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="Ej. Base Centro" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-[#636388] mb-1">Nombre Encargado</label>
                                            <input required type="text" className="w-full rounded-lg border-gray-300 text-sm" value={unitForm.managerName} onChange={e => setUnitForm({ ...unitForm, managerName: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[#636388] mb-1">Número Encargado</label>
                                            <div className="flex gap-2">
                                                <select className="w-20 rounded-lg border-gray-300 text-sm px-1" value={unitManagerPrefix} onChange={e => setUnitManagerPrefix(e.target.value)}>
                                                    {countryCodes.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                                </select>
                                                <input required type="text" className="flex-1 rounded-lg border-gray-300 text-sm" value={unitForm.managerNumber} onChange={e => setUnitForm({ ...unitForm, managerNumber: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Número Recepcionista (Opcional)</label>
                                        <div className="flex gap-2">
                                            <select className="w-24 rounded-lg border-gray-300 text-sm" value={unitReceptionistPrefix} onChange={e => setUnitReceptionistPrefix(e.target.value)}>
                                                {countryCodes.map(c => <option key={c.code} value={c.code}>{c.country} {c.code}</option>)}
                                            </select>
                                            <input type="text" className="flex-1 rounded-lg border-gray-300 text-sm" value={unitForm.receptionistNumber} onChange={e => setUnitForm({ ...unitForm, receptionistNumber: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Ubicación</label>
                                        <input type="text" className="w-full rounded-lg border-gray-300 text-sm" value={unitForm.location} onChange={e => setUnitForm({ ...unitForm, location: e.target.value })} placeholder="Dirección (Opcional)" />
                                    </div>
                                    {/* Google Maps Coordinates Input */}
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Coordenadas (Pegar desde Google Maps)</label>
                                        <input
                                            required
                                            type="text"
                                            className="w-full rounded-lg border-gray-300 text-sm placeholder-gray-400 font-mono"
                                            value={unitForm.coordsInput}
                                            onChange={handleUnitCoordsChange}
                                            placeholder="Ej. 25.684659, -100.226902"
                                        />
                                        <p className="text-[10px] text-gray-400 mt-1">
                                            Detectado: {unitForm.lat.toFixed(5)}, {unitForm.lng.toFixed(5)}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 bg-gray-50 p-2 rounded border border-gray-200">
                                        <input
                                            type="checkbox"
                                            id="unitIsOwn"
                                            className="w-4 h-4 text-primary rounded focus:ring-primary cursor-pointer"
                                            checked={unitForm.isOwn}
                                            onChange={e => setUnitForm({ ...unitForm, isOwn: e.target.checked })}
                                        />
                                        <label htmlFor="unitIsOwn" className="text-xs font-bold text-[#636388] cursor-pointer select-none">
                                            Es Base Propia <span className="font-normal text-gray-500">(Comisión 100%)</span>
                                        </label>
                                    </div>
                                    <button type="submit" className="mt-2 w-full bg-primary hover:bg-primary-hover text-white font-bold py-2.5 rounded-lg transition-colors">
                                        {editingId ? 'Guardar Cambios' : 'Registrar Base'}
                                    </button>
                                </form>
                            )}

                            {activeTab === 'drivers' && (
                                <form onSubmit={handleDriverSubmit} className="p-6 flex flex-col gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Nombre Repartidor</label>
                                        <input required type="text" className="w-full rounded-lg border-gray-300 text-sm" value={driverForm.name} onChange={e => setDriverForm({ ...driverForm, name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Contraseña (Opcional)</label>
                                        <input type="text" className="w-full rounded-lg border-gray-300 text-sm" value={driverForm.password} onChange={e => setDriverForm({ ...driverForm, password: e.target.value })} placeholder="Para acceso futuro" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Teléfono</label>
                                        <div className="flex gap-2">
                                            <select className="w-20 rounded-lg border-gray-300 text-sm px-1" value={driverPhonePrefix} onChange={e => setDriverPhonePrefix(e.target.value)}>
                                                {countryCodes.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                            </select>
                                            <input type="text" className="flex-1 rounded-lg border-gray-300 text-sm" value={driverForm.phoneNumber} onChange={e => setDriverForm({ ...driverForm, phoneNumber: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-[#636388] mb-1">Link Google Sheets - Ruta Matutina</label>
                                            <div className="flex gap-2">
                                                <span className="material-symbols-outlined text-gray-400">description</span>
                                                <input type="url" className="flex-1 rounded-lg border-gray-300 text-sm" value={driverForm.morningSheetUrl} onChange={e => setDriverForm({ ...driverForm, morningSheetUrl: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/..." />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[#636388] mb-1">Link Google Sheets - Ruta Vespertina</label>
                                            <div className="flex gap-2">
                                                <span className="material-symbols-outlined text-gray-400">description</span>
                                                <input type="url" className="flex-1 rounded-lg border-gray-300 text-sm" value={driverForm.eveningSheetUrl} onChange={e => setDriverForm({ ...driverForm, eveningSheetUrl: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/..." />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[#636388] mb-1">Link Google My Maps - Matutino</label>
                                            <div className="flex gap-2">
                                                <span className="material-symbols-outlined text-purple-400">map</span>
                                                <input type="url" className="flex-1 rounded-lg border-gray-300 text-sm" value={driverForm.morningMyMapsUrl} onChange={e => setDriverForm({ ...driverForm, morningMyMapsUrl: e.target.value })} placeholder="https://www.google.com/maps/d/..." />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[#636388] mb-1">Link Google My Maps - Vespertino</label>
                                            <div className="flex gap-2">
                                                <span className="material-symbols-outlined text-purple-400">map</span>
                                                <input type="url" className="flex-1 rounded-lg border-gray-300 text-sm" value={driverForm.eveningMyMapsUrl} onChange={e => setDriverForm({ ...driverForm, eveningMyMapsUrl: e.target.value })} placeholder="https://www.google.com/maps/d/..." />
                                            </div>
                                        </div>
                                    </div>

                                    <button type="submit" className="mt-2 w-full bg-primary hover:bg-primary-hover text-white font-bold py-2.5 rounded-lg transition-colors">
                                        {editingId ? 'Guardar Cambios' : 'Registrar Repartidor'}
                                    </button>
                                </form>
                            )}

                            {activeTab === 'administrators' && (
                                <form onSubmit={handleAdminSubmit} className="p-6 flex flex-col gap-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-[#636388] mb-1">Rol</label>
                                            <select
                                                className="w-full rounded-lg border-gray-300 text-sm"
                                                value={adminForm.role}
                                                onChange={e => setAdminForm({ ...adminForm, role: e.target.value })}
                                                disabled={!!editingId}
                                            >
                                                <option value="Administrador">Administrador (Global)</option>
                                                <option value="Usuario">Usuario (Operativo)</option>
                                                <option value="Comerciante">Comerciante (Empresa)</option>
                                            </select>
                                        </div>
                                        {adminForm.role === 'Comerciante' && (
                                            <div>
                                                <label className="block text-xs font-bold text-[#636388] mb-1">Empresa</label>
                                                <select
                                                    className="w-full rounded-lg border-gray-300 text-sm"
                                                    value={adminForm.businessId}
                                                    onChange={e => setAdminForm({ ...adminForm, businessId: e.target.value })}
                                                    required
                                                >
                                                    <option value="">Selecciona Empresa</option>
                                                    {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Nombre</label>
                                        <input required type="text" className="w-full rounded-lg border-gray-300 text-sm" value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-1">Teléfono (WhatsApp)</label>
                                        <div className="flex gap-2">
                                            <select className="w-24 rounded-lg border-gray-300 text-sm" value={adminPhonePrefix} onChange={e => setAdminPhonePrefix(e.target.value)}>
                                                {countryCodes.map(c => <option key={c.code} value={c.code}>{c.country} {c.code}</option>)}
                                            </select>
                                            <input required type="text" className="flex-1 rounded-lg border-gray-300 text-sm" value={adminForm.phone} onChange={e => setAdminForm({ ...adminForm, phone: e.target.value })} placeholder="Número" />
                                        </div>
                                    </div>

                                    {/* Auth Fields for Comerciante (Create Mode) */}
                                    {adminForm.role === 'Comerciante' && !editingId && (
                                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 flex flex-col gap-3">
                                            <h4 className="text-xs font-bold text-gray-500 uppercase">Credenciales de Acceso</h4>
                                            <div>
                                                <label className="block text-xs font-bold text-[#636388] mb-1">Correo Electrónico</label>
                                                <input required type="email" className="w-full rounded-lg border-gray-300 text-sm" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} placeholder="usuario@empresa.com" />
                                            </div>
                                        </div>
                                    )}

                                    {!editingId && adminForm.role === 'Administrador' && (
                                        <div className="p-3 bg-blue-50 text-blue-700 text-xs rounded-lg border border-blue-100">
                                            El administrador recibirá un mensaje de WhatsApp de confirmación y podrá registrar negocios enviando mensajes al bot.
                                        </div>
                                    )}
                                    <button type="submit" className="mt-2 w-full bg-primary hover:bg-primary-hover text-white font-bold py-2.5 rounded-lg transition-colors">
                                        {editingId ? 'Guardar Cambios' : 'Registrar Usuario'}
                                    </button>
                                </form>
                            )}

                            {activeTab === 'maps' && (
                                <form onSubmit={handleMapSubmit} className="p-6 flex flex-col gap-5">
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-2 uppercase tracking-wide">Nombre de la Ruta / Identificador</label>
                                        <div className="flex items-center gap-3 px-4 h-12 bg-gray-50 border border-gray-200 rounded-xl focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                                            <span className="material-symbols-outlined text-gray-400">edit_note</span>
                                            <input 
                                                required 
                                                type="text" 
                                                className="flex-1 bg-transparent border-none outline-none text-sm text-[#111118]" 
                                                value={mapForm.name} 
                                                onChange={e => setMapForm({ ...mapForm, name: e.target.value })} 
                                                placeholder="Ej. Mapas Maestros Mty" 
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-2 uppercase tracking-wide">Link Mapa Matutino</label>
                                        <div className="flex items-center gap-3 px-4 h-12 bg-gray-50 border border-gray-200 rounded-xl focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                                            <span className="material-symbols-outlined text-purple-400">map</span>
                                            <input 
                                                type="url" 
                                                className="flex-1 bg-transparent border-none outline-none text-sm text-[#111118]" 
                                                value={mapForm.morningMapUrl} 
                                                onChange={e => setMapForm({ ...mapForm, morningMapUrl: e.target.value })} 
                                                placeholder="https://www.google.com/maps/d/..." 
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-[#636388] mb-2 uppercase tracking-wide">Link Mapa Vespertino</label>
                                        <div className="flex items-center gap-3 px-4 h-12 bg-gray-50 border border-gray-200 rounded-xl focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                                            <span className="material-symbols-outlined text-orange-400">map</span>
                                            <input 
                                                type="url" 
                                                className="flex-1 bg-transparent border-none outline-none text-sm text-[#111118]" 
                                                value={mapForm.eveningMapUrl} 
                                                onChange={e => setMapForm({ ...mapForm, eveningMapUrl: e.target.value })} 
                                                placeholder="https://www.google.com/maps/d/..." 
                                            />
                                        </div>
                                    </div>
                                    <button 
                                        type="submit" 
                                        className="mt-2 w-full h-12 bg-[#0a0a33] hover:bg-[#0a0a33]/90 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98]"
                                    >
                                        {editingId ? 'Guardar Cambios' : 'Registrar Mapas'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Registry;