import React, { useState } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { useAppStore } from '../store/useStore';
import { addBusiness, getBusinesses } from '../services/dataService';
import { pushToGoogleSheets } from '../services/googleSheetsService';

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

    return (
        <div className={`absolute top-4 left-4 bottom-4 z-[800] w-[540px] flex flex-col glass-panel bg-black/80 border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-[120%] opacity-0 pointer-events-none'}`}>
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
                <button
                    type="button"
                    title="Limpiar todos los campos y comenzar un nuevo registro"
                    onClick={() => {
                        resetNewClient();
                        setSelectingFor(null);
                        setDraftMarker(null);
                    }}
                    className="flex items-center gap-2 group bg-transparent border-none outline-none cursor-pointer"
                >
                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center group-hover:bg-primary/40 transition-colors">
                        <span className="material-symbols-outlined text-primary text-[18px] group-hover:rotate-180 transition-transform duration-300">refresh</span>
                    </div>
                    <h3 className="text-base font-bold text-white uppercase tracking-wide group-hover:text-primary transition-colors">Nuevo Cliente</h3>
                </button>
                <button onClick={() => {
                    setSidebarOpen(false);
                    resetNewClient();
                    setDraftMarker(null);
                }} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 scrollbar-hide">
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Nombre del Cliente</label>
                        <input
                            type="text"
                            placeholder="Nombre del nuevo cliente"
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-500 transition-all"
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
                    <div className="bg-pink-500/5 border border-pink-500/10 rounded-xl p-3 mt-2">
                        <label className="block text-[10px] font-black text-pink-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
                            Bolsas a entregar
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                placeholder="0"
                                className="w-24 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-pink-500 placeholder-gray-500 transition-all font-mono"
                                value={newClient.bags}
                                onChange={(e) => setNewClient({ bags: parseInt(e.target.value) || 0 })}
                                min="0"
                            />
                            <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Cantidad de bolsas</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2 mt-6">
                    <button 
                        onClick={async () => {
                            if (!newClient.name) return alert('El nombre es requerido');
                            setCreatingTrip(true);
                            try {
                                const coordsParts = newClient.coords.split(',').map(s => s.trim());
                                const lat = coordsParts.length === 2 ? parseFloat(coordsParts[0]) : 0;
                                const lng = coordsParts.length === 2 ? parseFloat(coordsParts[1]) : 0;

                                await addBusiness({
                                    name: newClient.name,
                                    type: 'Moral', 
                                    location: newClient.address,
                                    phone: newClient.phone,
                                    lat,
                                    lng,
                                    locationLink: newClient.locationLink,
                                    routeType: 'Matutina'
                                } as any);

                                pushToGoogleSheets('Matutina', {
                                    name: newClient.name,
                                    phone: newClient.phone,
                                    address: newClient.address,
                                    locationLink: newClient.locationLink,
                                    coords: newClient.coords,
                                    bags: newClient.bags
                                });

                                showToast('Cliente guardado en RUTA MATUTINA');
                                resetNewClient();
                                setDraftMarker(null);
                                getBusinesses().then(setBusinesses);
                            } catch (err: any) {
                                console.error(err);
                                showToast('Error: ' + (err.message || 'Fallo al guardar'), 'error');
                            } finally {
                                setCreatingTrip(false);
                            }
                        }}
                        disabled={creatingTrip}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-900/20 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined font-bold">wb_twilight</span>
                        Guardar en Ruta Matutina
                    </button>

                    <button 
                        onClick={async () => {
                            if (!newClient.name) return showToast('El nombre es requerido', 'error');
                            setCreatingTrip(true);
                            try {
                                const coordsParts = newClient.coords.split(',').map(s => s.trim());
                                const lat = coordsParts.length === 2 ? parseFloat(coordsParts[0]) : 0;
                                const lng = coordsParts.length === 2 ? parseFloat(coordsParts[1]) : 0;

                                await addBusiness({
                                    name: newClient.name,
                                    type: 'Moral',
                                    location: newClient.address,
                                    phone: newClient.phone,
                                    lat,
                                    lng,
                                    locationLink: newClient.locationLink,
                                    routeType: 'Vespertina'
                                } as any);

                                pushToGoogleSheets('Vespertina', {
                                    name: newClient.name,
                                    phone: newClient.phone,
                                    address: newClient.address,
                                    locationLink: newClient.locationLink,
                                    coords: newClient.coords,
                                    bags: newClient.bags
                                });

                                showToast('Cliente guardado en RUTA VESPERTINA');
                                resetNewClient();
                                setDraftMarker(null);
                                getBusinesses().then(setBusinesses);
                            } catch (err: any) {
                                console.error(err);
                                showToast('Error: ' + (err.message || 'Fallo al guardar'), 'error');
                            } finally {
                                setCreatingTrip(false);
                            }
                        }}
                        disabled={creatingTrip}
                        className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-orange-900/20 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined font-bold">wb_sunny</span>
                        Guardar en Ruta Vespertina
                    </button>
                </div>
            </div>
        </div>
    );
};
