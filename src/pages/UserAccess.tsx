import React, { useState, useEffect } from 'react';
import { getAllowedUsers, addAllowedUser, removeAllowedUser, updateAllowedUserRole, updateAllowedUserViews, updateAllowedUserName, User } from '../services/authService';
import { getBusinesses, Business, getDrivers, Driver } from '../services/dataService';

// All available sidebar views for permission assignment
const AVAILABLE_VIEWS = [
    { key: '/monitor', label: 'Monitor en Vivo', icon: 'cell_tower', group: 'Monitor' },
    { key: '/ruta-matutina', label: 'Ruta Matutina', icon: 'wb_twilight', group: 'Logística' },
    { key: '/ruta-vespertina', label: 'Ruta Vespertina', icon: 'wb_sunny', group: 'Logística' },
    { key: '/clients', label: 'Clientes (Spreadsheet)', icon: 'list_alt', group: 'Clientes' },
    { key: '/registry/negocios', label: 'Registro de Negocios', icon: 'store', group: 'Clientes' },
    { key: '/registry/destinos', label: 'Destinos', icon: 'place', group: 'Logística' },
    { key: '/registry/choferes', label: 'Repartidores', icon: 'id_card', group: 'Administración' },
    { key: '/invoices', label: 'Facturas', icon: 'request_quote', group: 'Administración' },
    { key: '/user-access', label: 'Control de Acceso', icon: 'group', group: 'Administración' },
];

const UserAccess = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState<'Administrador' | 'Usuario' | 'Chofer'>('Usuario');
    const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
    const [selectedDriverId, setSelectedDriverId] = useState<string>('');
    const [notification, setNotification] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingViewsFor, setEditingViewsFor] = useState<string | null>(null);
    const [editingViews, setEditingViews] = useState<string[]>([]);
    const [savingViews, setSavingViews] = useState(false);
    const [editingNameFor, setEditingNameFor] = useState<string | null>(null);
    const [editingNameValue, setEditingNameValue] = useState('');

    useEffect(() => {
        const init = async () => {
            await Promise.all([refreshUsers(), loadBusinesses(), loadDrivers()]);
        };
        init();
    }, []);

    const refreshUsers = async () => {
        try {
            const data = await getAllowedUsers();
            setUsers(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const loadBusinesses = async () => {
        const data = await getBusinesses();
        setBusinesses(data);
    };

    const loadDrivers = async () => {
        const data = await getDrivers();
        setDrivers(data);
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUserEmail) return;



        if (newUserRole === 'Chofer' && !selectedDriverId) {
            setNotification({ msg: 'Debe asignar un repartidor al acceso de tipo Chofer', type: 'error' });
            setTimeout(() => setNotification(null), 3000);
            return;
        }

        // Determine businessId logic
        let finalBusinessId = null;

        if (newUserRole === 'Administrador') {
            // Find 'Healthy Dream Soporte' business automatically
            const supportBusiness = businesses.find(b => b.name === 'Healthy Dream Soporte');
            if (supportBusiness) {
                finalBusinessId = supportBusiness.id;
            } else {
                console.warn("Advertencia: No se encontró la empresa 'Healthy Dream Soporte'. El admin se creará sin empresa.");
            }
        }

        // Pass password to create Auth account in Supabase
        const success = await addAllowedUser(newUserEmail, newUserPassword || undefined, newUserRole, finalBusinessId || undefined, newUserName || undefined, newUserRole === 'Chofer' ? selectedDriverId || undefined : undefined);

        if (success) {
            setNotification({ msg: 'Acceso otorgado correctamente.' + (newUserPassword ? ' El usuario ya puede iniciar sesión con su contraseña.' : ' El usuario deberá iniciar sesión con Google/Microsoft.'), type: 'success' });
            setNewUserEmail('');
            setNewUserName('');
            setNewUserPassword('');
            setNewUserRole('Usuario');
            setSelectedBusinessId('');
            setSelectedDriverId('');
            await refreshUsers();
        } else {
            setNotification({ msg: 'El usuario ya existe o hubo un error', type: 'error' });
        }

        setTimeout(() => setNotification(null), 3000);
    };

    const handleRemoveUser = async (email: string) => {
        if (confirm(`¿Estás seguro de que quieres eliminar el acceso para ${email}?`)) {
            await removeAllowedUser(email);
            await refreshUsers();
            setNotification({ msg: 'Usuario eliminado correctamente', type: 'success' });
            setTimeout(() => setNotification(null), 3000);
        }
    };

    const getBusinessName = (id?: string) => {
        if (!id) return '';
        const b = businesses.find(bz => bz.id === id);
        return b ? b.name : 'Empresa Desconocida';
    };

    const getDriverName = (id?: string) => {
        if (!id) return '';
        const d = drivers.find(dr => dr.id === id);
        return d ? `${d.name} (${d.licensePlate})` : 'Repartidor Desconocido';
    };

    const handleOpenViewEditor = (user: User) => {
        setEditingViewsFor(user.email);
        setEditingViews([...(user.allowedViews || [])]);
    };

    const handleToggleView = (viewKey: string) => {
        setEditingViews(prev =>
            prev.includes(viewKey) ? prev.filter(v => v !== viewKey) : [...prev, viewKey]
        );
    };

    const handleSaveViews = async () => {
        if (!editingViewsFor) return;
        setSavingViews(true);
        const success = await updateAllowedUserViews(editingViewsFor, editingViews);
        if (success) {
            setNotification({ msg: 'Permisos de vistas actualizados correctamente', type: 'success' });
            await refreshUsers();
        } else {
            setNotification({ msg: 'Error al actualizar permisos de vistas', type: 'error' });
        }
        setSavingViews(false);
        setEditingViewsFor(null);
        setTimeout(() => setNotification(null), 3000);
    };

    const handleSelectAllViews = () => {
        setEditingViews(AVAILABLE_VIEWS.map(v => v.key));
    };

    const handleDeselectAllViews = () => {
        setEditingViews([]);
    };

    const handleSaveName = async (email: string) => {
        if (!editingNameValue.trim()) {
            setNotification({ msg: 'El nombre no puede estar vacío', type: 'error' });
            setTimeout(() => setNotification(null), 3000);
            return;
        }
        const success = await updateAllowedUserName(email, editingNameValue.trim());
        if (success) {
            setNotification({ msg: 'Nombre actualizado correctamente', type: 'success' });
            await refreshUsers();
        } else {
            setNotification({ msg: 'Error al actualizar el nombre', type: 'error' });
        }
        setEditingNameFor(null);
        setTimeout(() => setNotification(null), 3000);
    };

    const handleExportCSV = () => {
        if (users.length === 0) return alert('No hay usuarios para exportar.');
        const headers = ['Email', 'Rol', 'ID Empresa', 'Nombre Empresa', 'Fecha Registro'];
        const rows = users.map(u => [u.email, u.role, u.businessId || '', getBusinessName(u.businessId), new Date(u.created_at || '').toLocaleDateString()]);
        const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `usuarios_acceso_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-background-light overflow-y-auto">
            <header className="sticky top-0 z-10 bg-white/80 px-8 py-6 border-b border-gray-200 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="text-[#111118] text-3xl font-extrabold leading-tight tracking-tight">Control de Acceso</h2>
                    <p className="text-[#636388] text-sm font-medium">Gestiona el personal autorizado. Los usuarios deberán validar su identidad mediante Google/Microsoft.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm"
                    >
                        <span className="material-symbols-outlined text-[18px]">download</span> Exportar CSV
                    </button>
                </div>
            </header>

            <div className="p-8 flex flex-col gap-8 max-w-[1200px] w-full mx-auto">
                {/* Add User Card */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-[#111118] mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">person_add</span>
                        Otorgar Nuevo Acceso
                    </h3>
                    <form onSubmit={handleAddUser} className="flex flex-col md:flex-row flex-wrap gap-4 items-end">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-[#636388] mb-1 uppercase tracking-wide">Correo Electrónico (Google / Microsoft)</label>
                            <input
                                type="email"
                                value={newUserEmail}
                                onChange={(e) => setNewUserEmail(e.target.value)}
                                className="block w-full rounded-lg border-gray-300 px-4 py-2.5 text-sm font-medium shadow-sm focus:border-primary focus:ring-primary"
                                placeholder="usuario@dominio.com"
                                required
                            />
                        </div>

                        <div className="w-full md:w-48">
                            <label className="block text-xs font-bold text-[#636388] mb-1 uppercase tracking-wide">Nombre del Usuario</label>
                            <input
                                type="text"
                                value={newUserName}
                                onChange={(e) => setNewUserName(e.target.value)}
                                className="block w-full rounded-lg border-gray-300 px-4 py-2.5 text-sm font-medium shadow-sm focus:border-primary focus:ring-primary"
                                placeholder="Ej: Juan Pérez"
                            />
                        </div>

                        <div className="w-full md:w-48">
                            <label className="block text-xs font-bold text-[#636388] mb-1 uppercase tracking-wide">Contraseña (Opcional)</label>
                            <input
                                type="password"
                                value={newUserPassword}
                                onChange={(e) => setNewUserPassword(e.target.value)}
                                className="block w-full rounded-lg border-gray-300 px-4 py-2.5 text-sm font-medium shadow-sm focus:border-primary focus:ring-primary"
                                placeholder="Min. 6 caracteres"
                            />
                        </div>

                        <div className="w-full md:w-48">
                            <label className="block text-xs font-bold text-[#636388] mb-1 uppercase tracking-wide">Rol</label>
                            <select
                                value={newUserRole}
                                onChange={(e) => setNewUserRole(e.target.value as any)}
                                className="block w-full rounded-lg border-gray-300 px-4 py-2.5 text-sm font-medium shadow-sm focus:border-primary focus:ring-primary bg-white"
                            >
                                <option value="Usuario">Usuario</option>
                                <option value="Administrador">Administrador</option>
                                <option value="Chofer">Repartidor</option>
                            </select>
                        </div>


                        {newUserRole === 'Chofer' && (
                            <div className="w-full md:w-64 animate-in fade-in slide-in-from-left-2">
                                <label className="block text-xs font-bold text-[#636388] mb-1 uppercase tracking-wide">Repartidor Asignado</label>
                                <select
                                    value={selectedDriverId}
                                    onChange={(e) => setSelectedDriverId(e.target.value)}
                                    className="block w-full rounded-lg border-gray-300 px-4 py-2.5 text-sm font-medium shadow-sm focus:border-primary focus:ring-primary bg-white"
                                    required
                                >
                                    <option value="">Selecciona al Repartidor</option>
                                    {drivers.map(d => (
                                        <option key={d.id} value={d.id}>{d.name} ({d.vehicleModel})</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button type="submit" className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-md flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">add_circle</span>
                            Autorizar
                        </button>
                    </form>
                    {notification && (
                        <div className={`mt-4 p-3 rounded-lg text-sm font-bold flex items-center gap-2 ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            <span className="material-symbols-outlined text-[18px]">{notification.type === 'success' ? 'check_circle' : 'error'}</span>
                            {notification.msg}
                        </div>
                    )}
                </div>

                {/* User List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                        <h3 className="text-[#111118] font-bold text-sm">Usuarios Autorizados ({loading ? '...' : users.length})</h3>
                        <span className="text-xs font-medium text-[#636388] bg-gray-200 px-2 py-1 rounded">Acceso OAuth</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {loading ? <div className="p-8 text-center text-gray-400">Cargando...</div> : (
                            <>
                                {users.map((user) => (
                                    <div key={user.email} className="group">
                                        <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 font-bold border-2 border-white shadow-sm">
                                                    {(user.name || user.email).charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        {editingNameFor === user.email ? (
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type="text"
                                                                    value={editingNameValue}
                                                                    onChange={(e) => setEditingNameValue(e.target.value)}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(user.email); if (e.key === 'Escape') setEditingNameFor(null); }}
                                                                    className="rounded border-gray-300 px-2 py-1 text-sm font-bold focus:border-primary focus:ring-primary w-40"
                                                                    placeholder="Nombre del usuario"
                                                                    autoFocus
                                                                />
                                                                <button onClick={() => handleSaveName(user.email)} className="text-green-600 hover:bg-green-50 p-1 rounded" title="Guardar">
                                                                    <span className="material-symbols-outlined text-[16px]">check</span>
                                                                </button>
                                                                <button onClick={() => setEditingNameFor(null)} className="text-gray-400 hover:bg-gray-100 p-1 rounded" title="Cancelar">
                                                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <p className="text-[#111118] text-sm font-bold">{user.name || <span className="text-gray-400 italic font-normal">Sin nombre</span>}</p>
                                                                <button
                                                                    onClick={() => { setEditingNameFor(user.email); setEditingNameValue(user.name || ''); }}
                                                                    className="text-gray-400 hover:text-blue-600 p-0.5 rounded transition-colors"
                                                                    title="Editar nombre"
                                                                >
                                                                    <span className="material-symbols-outlined text-[14px]">edit</span>
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                    <p className="text-[#636388] text-xs font-medium">{user.email}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${user.role === 'Administrador' ? 'bg-purple-100 text-purple-700' : user.role === 'Chofer' ? 'bg-cyan-100 text-cyan-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {user.role || 'Usuario'}
                                                        </span>
                                                        {user.role === 'Chofer' && user.driverId && (
                                                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                                                                {getDriverName(user.driverId)}
                                                            </span>
                                                        )}
                                                        {user.role !== 'Administrador' && (user.allowedViews && user.allowedViews.length > 0) && (
                                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                                                                {user.allowedViews.length} vista{user.allowedViews.length !== 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                        <p className="text-[#636388] text-xs font-medium ml-1">Agregado: {new Date(user.created_at || '').toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {user.role !== 'Administrador' && user.role !== 'Chofer' && (
                                                    <button
                                                        onClick={() => editingViewsFor === user.email ? setEditingViewsFor(null) : handleOpenViewEditor(user)}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${editingViewsFor === user.email ? 'bg-indigo-100 text-indigo-700 border border-indigo-300' : 'bg-gray-50 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 border border-gray-200'}`}
                                                        title="Configurar Vistas"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                                                        Vistas
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleRemoveUser(user.email)}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Revocar Acceso"
                                                >
                                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Collapsible View Permissions Editor */}
                                        {editingViewsFor === user.email && (
                                            <div className="px-6 py-3 bg-indigo-50/50 border-t border-indigo-100">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[18px]">tune</span>
                                                        Configurar Vistas para {user.email}
                                                    </h4>
                                                    <div className="flex gap-2">
                                                        <button onClick={handleSelectAllViews} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-100 transition-colors">
                                                            Seleccionar Todo
                                                        </button>
                                                        <button onClick={handleDeselectAllViews} className="text-[10px] font-bold text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                                                            Deseleccionar Todo
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-gray-500 mb-2">Si no se selecciona ninguna vista, el usuario verá las vistas por defecto de su rol.</p>

                                                {/* Compact grid of checkboxes */}
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                                                    {AVAILABLE_VIEWS.map(view => (
                                                        <label
                                                            key={view.key}
                                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs border ${editingViews.includes(view.key)
                                                                ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-bold shadow-sm'
                                                                : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50'
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={editingViews.includes(view.key)}
                                                                onChange={() => handleToggleView(view.key)}
                                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 flex-shrink-0"
                                                            />
                                                            <span className="material-symbols-outlined text-[14px] flex-shrink-0">{view.icon}</span>
                                                            <span className="truncate">{view.label}</span>
                                                        </label>
                                                    ))}
                                                </div>

                                                <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-indigo-100">
                                                    <button
                                                        onClick={() => setEditingViewsFor(null)}
                                                        className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={handleSaveViews}
                                                        disabled={savingViews}
                                                        className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">{savingViews ? 'hourglass_empty' : 'save'}</span>
                                                        {savingViews ? 'Guardando...' : 'Guardar'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {users.length === 0 && (
                                    <div className="p-8 text-center text-gray-400 text-sm">No hay usuarios autorizados.</div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserAccess;
