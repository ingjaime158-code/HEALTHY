import React, { useState, useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { useAppStore } from '../store/useStore';
import { addBusiness, getBusinesses, getDrivers, Driver } from '../services/dataService';
import { pushToGoogleSheets } from '../services/googleSheetsService';
import { parseClientProfile, serializeClientProfile } from '../utils/clientProfile';
import { useHealthyDreamsStore } from '../store/useHealthyDreamsStore';

interface PlanItem {
    id: string;
    planType: string;
    package: string;
    siglas: string;
    tiempos: number;
}

interface Props {
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    setBusinesses: (biz: any[]) => void;
}

const extractCoordsFromLink = (link: string) => {
    const atMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) return `${atMatch[1]}, ${atMatch[2]}`;
    const qMatch = link.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) return `${qMatch[1]}, ${qMatch[2]}`;
    return null;
};

export const NewClientSidebar: React.FC<Props> = ({ showToast, setBusinesses }) => {
    const map = useMap();
    const isSidebarOpen = useAppStore(state => state.isSidebarOpen);
    const setSidebarOpen = useAppStore(state => state.setSidebarOpen);
    const newClient = useAppStore(state => state.newClient);
    const setNewClient = useAppStore(state => state.setNewClient);
    const resetNewClient = useAppStore(state => state.resetNewClient);
    const setSelectingFor = useAppStore(state => state.setSelectingFor);
    const setDraftMarker = useAppStore(state => state.setDraftMarker);
    const [creatingTrip, setCreatingTrip] = useState(false);
    const [systemDrivers, setSystemDrivers] = useState<Driver[]>([]);
    
    // Plans list state
    const [plansList, setPlansList] = useState<PlanItem[]>([]);

    // State for first customer draft when combining clients at same address
    const [firstCustomerDraft, setFirstCustomerDraft] = useState<{
        name: string;
        phone: string;
        exclusions: string;
        plans: PlanItem[];
        extraDishes: number;
    } | null>(null);

    // Sub-form states for configuring new plan
    const [newPlanType, setNewPlanType] = useState('HEALTHY');
    const [newPackage, setNewPackage] = useState('Comida');
    const [newSiglas, setNewSiglas] = useState('C');
    const [newCustomPlanName, setNewCustomPlanName] = useState('');
    const [newCustomTiempos, setNewCustomTiempos] = useState(1);

    const [extraDishes, setExtraDishes] = useState(0);

    const packageTiempos: Record<string, number> = {
        'Comida': 1,
        'Comida + Cena': 2,
        'Desayuno + Comida': 2,
        'Desayuno + Comida + Cena': 3,
        'Desayuno + Cena': 2,
        'Desayuno': 1,
        'Cena': 1
    };

    const packageSiglas: Record<string, string> = {
        'Comida': 'C',
        'Comida + Cena': 'C+Ce',
        'Desayuno + Comida': 'D+C',
        'Desayuno + Comida + Cena': 'D+C+C',
        'Desayuno + Cena': 'D+Ce',
        'Desayuno': 'De',
        'Cena': 'Ce'
    };

    useEffect(() => {
        if (newPackage !== 'Personalizado...') {
            const defaultSiglas = packageSiglas[newPackage];
            if (defaultSiglas) {
                setNewSiglas(defaultSiglas);
            }
        }
    }, [newPackage]);

    useEffect(() => {
        getDrivers().then(setSystemDrivers).catch(console.error);
    }, []);

    // Auto-populate Google Maps location link when coordinates change
    useEffect(() => {
        if (newClient.coords) {
            const parts = newClient.coords.split(',').map(s => s.trim());
            if (parts.length === 2) {
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    const generated = `https://www.google.com/maps?q=${lat},${lng}`;
                    if (newClient.locationLink !== generated) {
                        setNewClient({ locationLink: generated });
                    }
                }
            }
        }
    }, [newClient.coords, newClient.locationLink, setNewClient]);

    const sumTiempos = plansList.reduce((acc, plan) => acc + plan.tiempos, 0);
    const totalPlansCount = plansList.length;

    const dishesSunMon = (sumTiempos * 3) + extraDishes;
    const bagsSunMon = Math.ceil(dishesSunMon / 6);

    const dishesWedThu = (sumTiempos * 2) + extraDishes;
    const bagsWedThu = Math.ceil(dishesWedThu / 6);

    const today = new Date();
    const dayOfWeek = today.getDay();
    // Sunday (0), Monday (1), Tuesday (2) represent Delivery 1 (3 days covered)
    const isSundayOrMonday = dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 2;
    const activeBags = isSundayOrMonday ? bagsSunMon : bagsWedThu;

    const handleClearAndReset = () => {
        resetNewClient();
        setSelectingFor(null);
        setDraftMarker(null);
        setPlansList([]);
        setNewPlanType('HEALTHY');
        setNewPackage('Comida');
        setNewSiglas('C');
        setNewCustomPlanName('');
        setNewCustomTiempos(1);
        setExtraDishes(0);
        setFirstCustomerDraft(null);
    };

    return (
        <div className={`absolute top-4 left-4 bottom-4 z-[800] w-[540px] flex flex-col glass-panel bg-black/80 border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-[120%] opacity-0 pointer-events-none'}`}>
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
                <button
                    type="button"
                    title="Limpiar todos los campos y comenzar un nuevo registro"
                    onClick={handleClearAndReset}
                    className="flex items-center gap-2 group bg-transparent border-none outline-none cursor-pointer"
                >
                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center group-hover:bg-primary/40 transition-colors">
                        <span className="material-symbols-outlined text-primary text-[18px] group-hover:rotate-180 transition-transform duration-300">refresh</span>
                    </div>
                    <h3 className="text-base font-bold text-white uppercase tracking-wide group-hover:text-primary transition-colors">Nuevo Cliente</h3>
                </button>
                <button onClick={() => {
                    setSidebarOpen(false);
                    handleClearAndReset();
                }} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 scrollbar-hide">
                <div className="space-y-4">
                    {firstCustomerDraft && (
                        <div className="bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs rounded-xl p-3.5 flex items-center justify-between font-bold shadow-md shadow-purple-900/5 animate-pulse shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px] text-purple-400">house</span>
                                <span>Misma casa con: <strong className="text-white uppercase">{firstCustomerDraft.name}</strong></span>
                            </div>
                            <button 
                                type="button"
                                onClick={() => {
                                    setFirstCustomerDraft(null);
                                    showToast('Se canceló la captura combinada', 'info');
                                }}
                                className="text-purple-400 hover:text-red-400 text-[10px] uppercase font-black bg-purple-500/10 hover:bg-purple-500/20 px-2.5 py-1 rounded-lg transition-colors border border-purple-500/20"
                            >
                                Cancelar
                            </button>
                        </div>
                    )}
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Nombre del Cliente</label>
                        <input
                            type="text"
                            placeholder="Nombre del nuevo cliente"
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-500 transition-all uppercase"
                            value={newClient.name}
                            onChange={(e) => setNewClient({ name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Teléfono</label>
                        <input
                            type="tel"
                            placeholder="Ej: 81 1234 5678"
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-500 transition-all font-mono"
                            value={newClient.phone}
                            onChange={(e) => setNewClient({ phone: e.target.value.replace(/\D/g, '') })}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Dirección</label>
                        <textarea
                            placeholder="Calle, Número, Colonia..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-500 transition-all min-h-[80px]"
                            value={newClient.address}
                            onChange={(e) => setNewClient({ address: e.target.value })}
                        />
                        <button 
                            onClick={() => {
                                if (!newClient.address) return showToast('Ingresa una dirección primero', 'info');
                                const geocoder = new window.google.maps.Geocoder();
                                geocoder.geocode({ address: newClient.address }, (results, status) => {
                                    if (status === 'OK' && results && results[0]) {
                                        const loc = results[0].geometry.location;
                                        const lat = loc.lat();
                                        const lng = loc.lng();
                                        setNewClient({ coords: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
                                        setDraftMarker({ lat, lng });
                                        if (map) {
                                            map.panTo({ lat, lng });
                                            map.setZoom(17);
                                        }
                                    } else {
                                        alert('No se pudo encontrar la ubicación de esa dirección');
                                    }
                                });
                            }}
                            className="mt-1.5 w-full py-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                        >
                            Detectar por Dirección
                        </button>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Link de Ubicación (Google Maps)</label>
                        <input
                            type="text"
                            placeholder="https://maps.google.com/..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-500 transition-all"
                            value={newClient.locationLink}
                            onChange={(e) => {
                                const link = e.target.value;
                                const coords = extractCoordsFromLink(link);
                                if (coords) {
                                    const [latStr, lngStr] = coords.split(',');
                                    const lat = parseFloat(latStr.trim());
                                    const lng = parseFloat(lngStr.trim());
                                    setNewClient({ 
                                        locationLink: link,
                                        coords: coords
                                    });
                                    setDraftMarker({ lat, lng });
                                    if (map) {
                                        map.panTo({ lat, lng });
                                        map.setZoom(17);
                                    }
                                } else {
                                    setNewClient({ locationLink: link });
                                }
                             }}
                        />
                        <div className="flex gap-2 mt-1.5">
                            <button 
                                onClick={() => {
                                    const link = newClient.locationLink;
                                    if (!link) return showToast('Ingresa un link primero', 'info');
                                    
                                    const coords = extractCoordsFromLink(link);
                                    if (coords) {
                                        const [latStr, lngStr] = coords.split(',');
                                        const lat = parseFloat(latStr.trim());
                                        const lng = parseFloat(lngStr.trim());
                                        
                                        setNewClient({ coords });
                                        setDraftMarker({ lat, lng });
                                        
                                        if (map) {
                                            map.panTo({ lat, lng });
                                            map.setZoom(17);
                                        }
                                        alert('Ubicación encontrada y centrada en el mapa.');
                                    } else {
                                        alert('Este es un enlace corto (maps.app.goo.gl) que no contiene coordenadas directamente.\n\nEl sistema abrirá el mapa en una pestaña nueva para que puedas copiar la dirección o ver el punto, pero se recomienda usar "Detectar por Dirección" aquí mismo.');
                                        window.open(link, '_blank');
                                    }
                                }}
                                className="flex-1 py-2 bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:bg-blue-600/40 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                            >
                                <div className="flex items-center justify-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">explore</span>
                                    Encontrar en Mapa
                                </div>
                            </button>
                            <button 
                                onClick={() => {
                                    if (newClient.coords) {
                                        const parts = newClient.coords.split(',').map(s => parseFloat(s.trim()));
                                        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                                            setDraftMarker({ lat: parts[0], lng: parts[1] });
                                            alert('Se ha colocado un pin en las coordenadas detectadas. Puedes moverlo en el mapa.');
                                            return;
                                        }
                                    }
                                    alert('No se detectaron coordenadas. Usa "Detectar por Dirección" o mueve el pin manualmente.');
                                }}
                                className="flex-1 py-2 bg-amber-600/20 border border-amber-500/30 text-amber-400 hover:bg-amber-600/30 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                            >
                                Poner Pin
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Ubicación (Coordenadas)</label>
                        <input
                            type="text"
                            placeholder="Lat, Lng"
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-500 transition-all font-mono"
                            value={newClient.coords}
                            onChange={(e) => {
                                const val = e.target.value;
                                setNewClient({ coords: val });
                                const parts = val.split(',').map(s => parseFloat(s.trim()));
                                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                                    setDraftMarker({ lat: parts[0], lng: parts[1] });
                                }
                            }}
                        />
                    </div>
                    
                    {/* Dynamic Plans Manager Panel */}
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 mt-2 space-y-4">
                        <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">restaurant_menu</span>
                            Planes Alimenticios ({plansList.length})
                        </label>

                        {plansList.length === 0 ? (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg text-center font-bold">
                                No has agregado ningún plan. Debes agregar al menos uno para guardar el cliente.
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                {plansList.map((plan) => (
                                    <div key={plan.id} className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-lg group hover:border-blue-500/30 transition-all">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="bg-blue-500/20 text-blue-300 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                                    {plan.planType}
                                                </span>
                                                <span className="text-xs text-white font-bold">{plan.package}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono mt-0.5">
                                                <span>Siglas: <strong className="text-gray-200 font-bold">{plan.siglas}</strong></span>
                                                <span>•</span>
                                                <span>Platos/día: <strong className="text-gray-200 font-bold">{plan.tiempos}</strong></span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPlansList(plansList.filter(p => p.id !== plan.id));
                                            }}
                                            className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            title="Eliminar este plan"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Form for adding a new plan */}
                        <div className="border-t border-white/10 pt-4 space-y-3">
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                Configurar e Incorporar Nuevo Plan
                            </label>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Tipo de Plan</label>
                                    <select
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        value={newPlanType}
                                        onChange={(e) => {
                                            setNewPlanType(e.target.value);
                                            if (e.target.value !== 'PERSONALIZADO') {
                                                setNewCustomPlanName('');
                                            }
                                        }}
                                    >
                                        <option value="HEALTHY">HEALTHY</option>
                                        <option value="SLIM">SLIM</option>
                                        <option value="STRONG">STRONG</option>
                                        <option value="PERSONALIZADO">OTRO PLAN...</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Paquete Contratado</label>
                                    <select
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        value={newPackage}
                                        onChange={(e) => {
                                            const pkg = e.target.value;
                                            setNewPackage(pkg);
                                            if (pkg !== 'Personalizado...') {
                                                setNewSiglas(packageSiglas[pkg] || '');
                                            }
                                        }}
                                    >
                                        <option value="Comida">Comida (1 tiempo)</option>
                                        <option value="Comida + Cena">Comida + Cena (2 tiempos)</option>
                                        <option value="Desayuno + Comida">Desayuno + Comida (2 tiempos)</option>
                                        <option value="Desayuno + Comida + Cena">Desayuno + Comida + Cena (3 tiempos)</option>
                                        <option value="Desayuno + Cena">Desayuno + Cena (2 tiempos)</option>
                                        <option value="Desayuno">Desayuno (1 tiempo)</option>
                                        <option value="Cena">Cena (1 tiempo)</option>
                                        <option value="Personalizado...">Personalizado / Otro...</option>
                                    </select>
                                </div>
                            </div>

                            {newPlanType === 'PERSONALIZADO' && (
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Nombre del Plan Personalizado</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: KETO, VEGAN..."
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase"
                                        value={newCustomPlanName}
                                        onChange={(e) => setNewCustomPlanName(e.target.value)}
                                    />
                                </div>
                            )}

                            {newPackage === 'Personalizado...' && (
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Tiempos del Plan (Platillos por día)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="Ej: 4, 5"
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                        value={newCustomTiempos}
                                        onChange={(e) => setNewCustomTiempos(parseInt(e.target.value) || 1)}
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Siglas de Comida (Referencia)</label>
                                    <input
                                        type="text"
                                        disabled
                                        placeholder="Ej: C"
                                        className="w-full bg-black/20 border border-white/5 rounded-lg px-2.5 py-2 text-xs text-gray-400 uppercase font-mono cursor-not-allowed"
                                        value={newSiglas}
                                    />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const finalPlanType = newPlanType === 'PERSONALIZADO' 
                                                ? (newCustomPlanName.trim().toUpperCase() || 'OTRO') 
                                                : newPlanType;
                                            
                                            const finalTiempos = newPackage === 'Personalizado...' 
                                                ? newCustomTiempos 
                                                : (packageTiempos[newPackage] || 1);

                                            const newPlanItem: PlanItem = {
                                                id: Date.now().toString(),
                                                planType: finalPlanType,
                                                package: newPackage,
                                                siglas: newSiglas || 'C',
                                                tiempos: finalTiempos
                                            };

                                            setPlansList([...plansList, newPlanItem]);

                                            // Reset custom inputs
                                            if (newPlanType === 'PERSONALIZADO') {
                                                setNewCustomPlanName('');
                                            }
                                            showToast('Plan agregado con éxito', 'success');
                                        }}
                                        className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 border border-white/5"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">add_circle</span>
                                        Agregar Plan
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* General Additional Configurations */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-2 space-y-4">
                        <label className="block text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">settings</span>
                            Configuración Adicional
                        </label>
                        
                        <div>
                            <label className="block text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Exclusiones / Alergias</label>
                            <input
                                type="text"
                                placeholder="Ej: Sin Cebolla, Sin Lácteos"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={newClient.exclusions}
                                onChange={(e) => setNewClient({ exclusions: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Real-time Bags Calculator Card */}
                    <div className="bg-pink-500/5 border border-pink-500/10 rounded-xl p-4 mt-2 space-y-3">
                        <label className="block text-[10px] font-black text-pink-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
                            Cálculo de Bolsas en Tiempo Real
                        </label>
                        
                        {/* Sunday/Monday Delivery (3 days) */}
                        <div className={`flex items-center justify-between p-3 rounded-lg border transition-all ${isSundayOrMonday ? 'bg-pink-500/10 border-pink-500/30' : 'bg-black/20 border-white/5 opacity-70'}`}>
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-white">Entrega Domingo / Lunes</span>
                                    {isSundayOrMonday && (
                                        <span className="bg-pink-500 text-white font-black text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">ACTIVA</span>
                                    )}
                                </div>
                                <span className="text-[10px] text-gray-400 font-mono">
                                    3 días × ({sumTiempos} platillos/día) + {extraDishes} extras = {dishesSunMon} platillos
                                </span>
                            </div>
                            <div className="text-right">
                                <div className="bg-pink-500/20 text-pink-300 font-mono font-black text-sm px-3 py-1.5 rounded-lg border border-pink-500/30 flex items-center gap-1">
                                    {bagsSunMon} <span className="text-[10px] font-bold">{bagsSunMon === 1 ? 'BOLSA' : 'BOLSAS'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Wednesday/Thursday Delivery (2 days) */}
                        <div className={`flex items-center justify-between p-3 rounded-lg border transition-all ${!isSundayOrMonday ? 'bg-pink-500/10 border-pink-500/30' : 'bg-black/20 border-white/5 opacity-70'}`}>
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-white">Entrega Miércoles / Jueves</span>
                                    {!isSundayOrMonday && (
                                        <span className="bg-pink-500 text-white font-black text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">ACTIVA</span>
                                    )}
                                </div>
                                <span className="text-[10px] text-gray-400 font-mono">
                                    2 días × ({sumTiempos} platillos/día) + {extraDishes} extras = {dishesWedThu} platillos
                                </span>
                            </div>
                            <div className="text-right">
                                <div className="bg-pink-500/20 text-pink-300 font-mono font-black text-sm px-3 py-1.5 rounded-lg border border-pink-500/30 flex items-center gap-1">
                                    {bagsWedThu} <span className="text-[10px] font-bold">{bagsWedThu === 1 ? 'BOLSA' : 'BOLSAS'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2 mt-6">
                    {!firstCustomerDraft && (
                        <button 
                            type="button"
                            onClick={() => {
                                if (!newClient.name) return showToast('El nombre es requerido para el primer cliente', 'error');
                                if (plansList.length === 0) return showToast('Debes agregar al menos un plan para el primer cliente', 'error');
                                
                                setFirstCustomerDraft({
                                    name: newClient.name,
                                    phone: newClient.phone || '',
                                    exclusions: newClient.exclusions || 'Ninguna',
                                    plans: plansList,
                                    extraDishes: extraDishes
                                });

                                // Clear fields for the second customer while keeping address/location
                                setNewClient({
                                    name: '',
                                    phone: '',
                                    exclusions: 'Ninguna'
                                });
                                setPlansList([]);
                                setExtraDishes(0);

                                showToast('Dirección y mapa retenidos. Captura el segundo cliente en la misma dirección.', 'info');
                            }}
                            disabled={creatingTrip || plansList.length === 0}
                            className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-purple-800 disabled:to-indigo-800 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-purple-900/20 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-purple-500/20 mb-2"
                        >
                            <span className="material-symbols-outlined font-bold">house</span>
                            Agregar cliente en misma dirección
                        </button>
                    )}

                    <button 
                        onClick={async () => {
                            if (!newClient.name) return showToast('El nombre es requerido', 'error');
                            if (plansList.length === 0) return showToast('Debe agregar al menos un plan', 'error');
                            setCreatingTrip(true);
                            try {
                                const coordsParts = (newClient.coords || '').split(',').map(s => s.trim());
                                const lat = coordsParts.length === 2 ? parseFloat(coordsParts[0]) : 0;
                                const lng = coordsParts.length === 2 ? parseFloat(coordsParts[1]) : 0;

                                const isCombined = firstCustomerDraft !== null;
                                
                                const finalName = isCombined 
                                    ? `${firstCustomerDraft.name} Y ${newClient.name}`.toUpperCase()
                                    : newClient.name.toUpperCase();
                                
                                const finalPhone = isCombined
                                    ? [firstCustomerDraft.phone, newClient.phone].filter(Boolean).join(' / ')
                                    : newClient.phone;
                                
                                const finalExclusions = isCombined
                                    ? [firstCustomerDraft.exclusions, newClient.exclusions]
                                        .filter(e => e && e !== 'Ninguna' && e !== 'Ninguno' && e !== '')
                                        .join(' / ') || 'Ninguna'
                                    : newClient.exclusions || 'Ninguna';

                                const combinedPlans = isCombined
                                    ? [...firstCustomerDraft.plans, ...plansList]
                                    : plansList;

                                const combinedExtraDishes = isCombined
                                    ? firstCustomerDraft.extraDishes + extraDishes
                                    : extraDishes;

                                const finalPlanType = combinedPlans.map(p => p.planType).join(' + ') || 'NINGUNO';
                                const finalSiglas = combinedPlans.map(p => p.siglas).join(' + ') || 'C';
                                const finalPackage = combinedPlans.map(p => p.package).join(' + ') || 'Comida';
                                const combinedTiempos = combinedPlans.reduce((acc, plan) => acc + plan.tiempos, 0);
                                const combinedPlansCount = combinedPlans.length;

                                // Recalculate bags for combined client
                                let finalBags = activeBags;
                                if (isCombined) {
                                    const dishesSunMon = (combinedTiempos * 3) + combinedExtraDishes;
                                    const bagsSunMon = Math.ceil(dishesSunMon / 6);

                                    const dishesWedThu = (combinedTiempos * 2) + combinedExtraDishes;
                                    const bagsWedThu = Math.ceil(dishesWedThu / 6);

                                    finalBags = isSundayOrMonday ? bagsSunMon : bagsWedThu;
                                }

                                // Serialize label config to the email field
                                const labelConfig = {
                                    planType: finalPlanType,
                                    plansCount: combinedPlansCount,
                                    exclusions: finalExclusions,
                                    siglas: finalSiglas,
                                    driver: 'SIN ASIGNAR',
                                    extraDishes: combinedExtraDishes,
                                    tiempos: combinedTiempos,
                                    package: finalPackage,
                                    plans: combinedPlans,
                                    isManual: true
                                };
                                const emailJson = JSON.stringify(labelConfig);

                                await addBusiness({
                                    name: finalName,
                                    type: 'Moral', 
                                    location: newClient.address,
                                    phone: finalPhone,
                                    lat,
                                    lng,
                                    locationLink: newClient.locationLink,
                                    routeType: 'Matutina',
                                    email: emailJson
                                } as any);

                                pushToGoogleSheets('Matutina', {
                                    name: finalName,
                                    phone: finalPhone,
                                    address: newClient.address,
                                    locationLink: newClient.locationLink,
                                    coords: newClient.coords,
                                    bags: finalBags,
                                    planType: labelConfig.planType,
                                    plansCount: labelConfig.plansCount,
                                    exclusions: labelConfig.exclusions,
                                    siglas: labelConfig.siglas,
                                    driver: labelConfig.driver,
                                    tiempos: labelConfig.tiempos,
                                    isActive: true
                                });

                                showToast('Cliente guardado en RUTA MATUTINA y registrado en etiquetas');
                                handleClearAndReset();
                                getBusinesses().then(setBusinesses);
                                useHealthyDreamsStore.getState().fetchClientsAndDrivers(true);
                            } catch (err: any) {
                                console.error(err);
                                showToast('Error: ' + (err.message || 'Fallo al guardar'), 'error');
                            } finally {
                                setCreatingTrip(false);
                            }
                        }}
                        disabled={creatingTrip || plansList.length === 0}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-900/20 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="material-symbols-outlined font-bold">wb_twilight</span>
                        {firstCustomerDraft ? 'Guardar Ambos en Ruta Matutina' : 'Guardar en Ruta Matutina'}
                    </button>

                    <button 
                        onClick={async () => {
                            if (!newClient.name) return showToast('El nombre es requerido', 'error');
                            if (plansList.length === 0) return showToast('Debe agregar al menos un plan', 'error');
                            setCreatingTrip(true);
                            try {
                                const coordsParts = (newClient.coords || '').split(',').map(s => s.trim());
                                const lat = coordsParts.length === 2 ? parseFloat(coordsParts[0]) : 0;
                                const lng = coordsParts.length === 2 ? parseFloat(coordsParts[1]) : 0;

                                const isCombined = firstCustomerDraft !== null;
                                
                                const finalName = isCombined 
                                    ? `${firstCustomerDraft.name} Y ${newClient.name}`.toUpperCase()
                                    : newClient.name.toUpperCase();
                                
                                const finalPhone = isCombined
                                    ? [firstCustomerDraft.phone, newClient.phone].filter(Boolean).join(' / ')
                                    : newClient.phone;
                                
                                const finalExclusions = isCombined
                                    ? [firstCustomerDraft.exclusions, newClient.exclusions]
                                        .filter(e => e && e !== 'Ninguna' && e !== 'Ninguno' && e !== '')
                                        .join(' / ') || 'Ninguna'
                                    : newClient.exclusions || 'Ninguna';

                                const combinedPlans = isCombined
                                    ? [...firstCustomerDraft.plans, ...plansList]
                                    : plansList;

                                const combinedExtraDishes = isCombined
                                    ? firstCustomerDraft.extraDishes + extraDishes
                                    : extraDishes;

                                const finalPlanType = combinedPlans.map(p => p.planType).join(' + ') || 'NINGUNO';
                                const finalSiglas = combinedPlans.map(p => p.siglas).join(' + ') || 'C';
                                const finalPackage = combinedPlans.map(p => p.package).join(' + ') || 'Comida';
                                const combinedTiempos = combinedPlans.reduce((acc, plan) => acc + plan.tiempos, 0);
                                const combinedPlansCount = combinedPlans.length;

                                // Recalculate bags for combined client
                                let finalBags = activeBags;
                                if (isCombined) {
                                    const dishesSunMon = (combinedTiempos * 3) + combinedExtraDishes;
                                    const bagsSunMon = Math.ceil(dishesSunMon / 6);

                                    const dishesWedThu = (combinedTiempos * 2) + combinedExtraDishes;
                                    const bagsWedThu = Math.ceil(dishesWedThu / 6);

                                    finalBags = isSundayOrMonday ? bagsSunMon : bagsWedThu;
                                }

                                // Serialize label config to the email field
                                const labelConfig = {
                                    planType: finalPlanType,
                                    plansCount: combinedPlansCount,
                                    exclusions: finalExclusions,
                                    siglas: finalSiglas,
                                    driver: 'SIN ASIGNAR',
                                    extraDishes: combinedExtraDishes,
                                    tiempos: combinedTiempos,
                                    package: finalPackage,
                                    plans: combinedPlans
                                };
                                const emailJson = JSON.stringify(labelConfig);

                                await addBusiness({
                                    name: finalName,
                                    type: 'Moral',
                                    location: newClient.address,
                                    phone: finalPhone,
                                    lat,
                                    lng,
                                    locationLink: newClient.locationLink,
                                    routeType: 'Vespertina',
                                    email: emailJson
                                } as any);

                                pushToGoogleSheets('Vespertina', {
                                    name: finalName,
                                    phone: finalPhone,
                                    address: newClient.address,
                                    locationLink: newClient.locationLink,
                                    coords: newClient.coords,
                                    bags: finalBags,
                                    planType: labelConfig.planType,
                                    plansCount: labelConfig.plansCount,
                                    exclusions: labelConfig.exclusions,
                                    siglas: labelConfig.siglas,
                                    driver: labelConfig.driver,
                                    tiempos: labelConfig.tiempos,
                                    isActive: true
                                });

                                showToast('Cliente guardado en RUTA VESPERTINA y registrado en etiquetas');
                                handleClearAndReset();
                                getBusinesses().then(setBusinesses);
                                useHealthyDreamsStore.getState().fetchClientsAndDrivers(true);
                            } catch (err: any) {
                                console.error(err);
                                showToast('Error: ' + (err.message || 'Fallo al guardar'), 'error');
                            } finally {
                                setCreatingTrip(false);
                            }
                        }}
                        disabled={creatingTrip || plansList.length === 0}
                        className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-orange-900/20 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="material-symbols-outlined font-bold">wb_sunny</span>
                        {firstCustomerDraft ? 'Guardar Ambos en Ruta Vespertina' : 'Guardar en Ruta Vespertina'}
                    </button>
                </div>
            </div>
        </div>
    );
};
