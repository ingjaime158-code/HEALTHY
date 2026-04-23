import React, { useState, useEffect } from 'react';
import { getUnits, addUnit, deleteUnit, FleetUnit } from '../services/dataService';

const Bases = () => {
    const [bases, setBases] = useState<FleetUnit[]>([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        identifier: '', // New field
        manager: '',
        landline: '',
        mobile: '',
        address: '',
        coords: ''
    });

    useEffect(() => {
        loadBases();
    }, []);

    const loadBases = async () => {
        setLoading(true);
        const data = await getUnits();
        setBases(data);
        setLoading(false);
    };

    const handleSave = async () => {
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
            await addUnit({
                name: formData.name,
                identifier: formData.identifier, // Pass identifier
                managerName: formData.manager,
                managerNumber: formData.mobile,
                receptionistNumber: formData.landline,
                location: formData.address,
                lat,
                lng
            });
            await loadBases();
            setFormData({ name: '', identifier: '', manager: '', landline: '', mobile: '', address: '', coords: '' });
            alert('Base guardada exitosamente');
        } catch (error: any) {
            console.error(error);
            const msg = error.message || error.details || JSON.stringify(error);
            alert('Error al guardar base: ' + msg);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('¿Estás seguro de eliminar esta base?')) {
            const res = await deleteUnit(id);
            if (res.success) {
                loadBases();
            } else {
                alert(`Error al eliminar la base:\n${res.message || 'Verifica la consola.'}\n\nNota: Si tiene choferes asignados, no se podrá borrar automáticamente.`);
            }
        }
    };

    return (
        <div className="flex-1 bg-slate-50 p-6 overflow-y-auto h-full">
            <div className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-800">Gestión de Bases de Taxis</h2>
                        <p className="text-slate-500">Gestión Integral Healthy Dream</p>
                    </div>
                    <button onClick={() => setFormData({ name: '', manager: '', landline: '', mobile: '', address: '', coords: '' })} className="text-xs text-blue-600 hover:underline">
                        Limpiar Formulario
                    </button>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
                    <div className="flex justify-between items-center border-b pb-2 mb-4">
                        <h3 className="font-bold text-lg text-slate-800">Gestión de Bases</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Nombre de la Base</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                placeholder="Ej. HOTEL SAFY"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">ID / Identificador (Requerido)</label>
                            <input
                                type="text"
                                value={formData.identifier}
                                onChange={e => setFormData({ ...formData, identifier: e.target.value })}
                                className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                placeholder="Ej. SAFY-01"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Nombre del Encargado</label>
                            <input
                                type="text"
                                value={formData.manager}
                                onChange={e => setFormData({ ...formData, manager: e.target.value })}
                                className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono Fijo</label>
                            <input
                                type="text"
                                value={formData.landline}
                                onChange={e => setFormData({ ...formData, landline: e.target.value })}
                                className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono Celular</label>
                            <input
                                type="text"
                                value={formData.mobile}
                                onChange={e => setFormData({ ...formData, mobile: e.target.value })}
                                className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded border border-slate-200">
                        <h4 className="text-xs font-bold text-yellow-800 mb-2">Ubicación de la Base</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                            <input
                                type="text"
                                placeholder="Calle, Número, Colonia, Municipio"
                                value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                                className="col-span-3 border rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
                            />
                            <button className="bg-yellow-600 text-white rounded p-2 text-sm font-bold hover:bg-yellow-700 transition-colors flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">location_on</span> Ubicar
                            </button>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Coordenadas (Lat, Long)</label>
                            <input
                                type="text"
                                value={formData.coords}
                                onChange={e => setFormData({ ...formData, coords: e.target.value })}
                                className="w-full border rounded p-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                placeholder="Ej: 25.6866, -100.3161"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Ingresa manual o usa el botón de búsqueda.</p>
                        </div>
                    </div>

                    <div className="mt-4 text-right">
                        <button onClick={handleSave} className="bg-[#0b0c2a] text-yellow-400 px-6 py-2 rounded font-bold shadow border border-yellow-600 hover:bg-[#1a1c3d] flex items-center gap-2 ml-auto transition-colors">
                            <span className="material-symbols-outlined text-[18px]">add_business</span> Guardar Base
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-3">Base</th>
                                <th className="p-3">Encargado</th>
                                <th className="p-3">Contactos</th>
                                <th className="p-3">Coords</th>
                                <th className="p-3 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                            {loading ? (
                                <tr><td colSpan={5} className="p-8 text-center">Cargando...</td></tr>
                            ) : bases.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400">
                                        No hay bases registradas.
                                    </td>
                                </tr>
                            ) : (
                                bases.map(base => (
                                    <tr key={base.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3 font-bold">
                                            <div>{base.name}</div>
                                            <div className="text-[10px] text-gray-400 font-mono">{base.identifier}</div>
                                        </td>
                                        <td className="p-3">{base.managerName}</td>
                                        <td className="p-3 text-xs">
                                            <div><span className="font-bold">Fijo:</span> {base.receptionistNumber}</div>
                                            <div><span className="font-bold">Cel:</span> {base.managerNumber}</div>
                                        </td>
                                        <td className="p-3 text-xs w-1/4 truncate font-mono">{base.lat}, {base.lng}</td>
                                        <td className="p-3 text-center flex justify-center gap-1">
                                            <button className="text-blue-600 hover:text-blue-800 p-1"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                                            <button onClick={() => handleDelete(base.id)} className="text-red-500 hover:text-red-700 p-1 ml-1"><span className="material-symbols-outlined text-[18px]">delete</span></button>
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

export default Bases;
