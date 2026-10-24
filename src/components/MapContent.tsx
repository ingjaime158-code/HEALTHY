import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Map, AdvancedMarker, Pin, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { Trip, Business, FleetUnit } from '../services/dataService';
import { DriverRouteInfo, RouteClient, parseCoords } from '../services/routeMonitorService';
import TripRoute from './TripRoute';
import KmlOverlay from './KmlOverlay';
import TrafficLayer from './TrafficLayer';

const DEFAULT_CENTER = { lat: 25.6866, lng: -100.3161 }; // Monterrey/Guadalupe

export interface MapContentProps {
    activeTrips: Trip[];
    driverPositions: { [key: string]: { lat: number, lng: number, heading: number } };
    driverNames: { [key: string]: string };
    driverColors: { [key: string]: string };
    businesses: Business[];
    units: FleetUnit[];
    showBusinesses: boolean;
    showUnits: boolean;
    onMapClick?: (lat: number, lng: number) => void;
    selectingFor?: 'origin' | 'destination' | null;
    previewOrigin?: { lat: number, lng: number } | null;
    previewDest?: { lat: number, lng: number } | null;
    onRoutesFound?: (routes: google.maps.DirectionsRoute[]) => void;
    selectedRouteIndex?: number;
    previewStops?: { address: string; lat: number; lng: number }[];
    selectedTripId?: string | null;
    draftMarker?: { lat: number, lng: number } | null;
    onDraftMarkerDragEnd?: (lat: number, lng: number) => void;
    kmlUrl?: string | null;
    showTraffic?: boolean;

    // Route clients & selection
    routeDrivers?: DriverRouteInfo[];
    selectedDriverForDetails?: DriverRouteInfo | null;
    selectedRoute?: 'morning' | 'evening' | null;
    selectedClient?: RouteClient | null;
    onSelectClient?: (client: RouteClient | null) => void;
    isDispatchOpen?: boolean;
}

interface DisplayClientMarker {
    key: string;
    client: RouteClient;
    pos: { lat: number; lng: number };
    driverName: string;
    driverColor: string;
    order: number;
    isDelivered: boolean;
}

/**
 * Controller subcomponent that adjusts map bounds and centers when
 * route changes, driver changes, or a specific client is selected.
 */
const MapBoundsAdjuster: React.FC<{
    targetPosition?: { lat: number; lng: number } | null;
    allPoints: { lat: number; lng: number }[];
    viewKey: string;
    isDispatchOpen?: boolean;
}> = ({ targetPosition, allPoints, viewKey, isDispatchOpen }) => {
    const map = useMap();
    const lastKeyRef = useRef<string>('');

    // Smoothly pan & zoom to a single selected client
    useEffect(() => {
        if (!map || !targetPosition) return;
        map.panTo(targetPosition);
        if ((map.getZoom() ?? 0) < 15) {
            map.setZoom(16);
        }
    }, [map, targetPosition]);

    // Fit bounds when route or selected driver changes
    useEffect(() => {
        if (!map || allPoints.length === 0) return;
        if (lastKeyRef.current === viewKey) return;
        lastKeyRef.current = viewKey;

        const bounds = new google.maps.LatLngBounds();
        let valid = 0;
        allPoints.forEach(p => {
            if (p && !isNaN(p.lat) && !isNaN(p.lng) && p.lat !== 0 && p.lng !== 0) {
                bounds.extend(p);
                valid++;
            }
        });

        if (valid > 0) {
            const rightPadding = isDispatchOpen ? 380 : 60;
            map.fitBounds(bounds, { top: 70, bottom: 70, left: 70, right: rightPadding });
        }
    }, [map, allPoints, viewKey, isDispatchOpen]);

    return null;
};

const MapContent = ({ 
    activeTrips, 
    driverPositions, 
    driverNames, 
    driverColors = {},
    businesses = [], 
    units = [], 
    showBusinesses, 
    showUnits, 
    onMapClick, 
    selectingFor, 
    previewOrigin, 
    previewDest,
    onRoutesFound,
    selectedRouteIndex,
    previewStops,
    selectedTripId,
    draftMarker,
    onDraftMarkerDragEnd,
    kmlUrl,
    showTraffic,
    routeDrivers = [],
    selectedDriverForDetails = null,
    selectedRoute = null,
    selectedClient = null,
    onSelectClient,
    isDispatchOpen = true
}: MapContentProps) => {
    const [internalSelectedClient, setInternalSelectedClient] = useState<RouteClient | null>(null);
    const activeSelectedClient = selectedClient ?? internalSelectedClient;

    const TRIP_COLORS = [
        '#2563eb', // Blue
        '#dc2626', // Red
        '#059669', // Emerald
        '#d97706', // Amber
        '#7c3aed', // Violet
        '#e11d48', // Rose
        '#0891b2', // Cyan
        '#ea580c', // Orange
        '#65a30d', // Lime
        '#db2777'  // Pink
    ];

    // Helper to safely parse any coordinate string
    const safeParse = (cStr?: string, lat?: number, lng?: number): { lat: number; lng: number } | null => {
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
            return { lat, lng };
        }
        if (!cStr) return null;
        const parsed = parseCoords(cStr);
        if (parsed) return parsed;
        const clean = cStr.replace(/[^\d.,\-]/g, ' ').trim();
        const parts = clean.split(/[,\s]+/).map(p => parseFloat(p)).filter(p => !isNaN(p));
        if (parts.length >= 2) {
            let pLat = parts[0];
            let pLng = parts[1];
            if (pLat < 0 && pLng > 0) {
                const tmp = pLat; pLat = pLng; pLng = tmp;
            }
            if (pLat >= -90 && pLat <= 90 && pLng >= -180 && pLng <= 180 && (pLat !== 0 || pLng !== 0)) {
                return { lat: pLat, lng: pLng };
            }
        }
        return null;
    };

    // Calculate markers for route clients (or fallback to businesses)
    const clientMarkers = useMemo<DisplayClientMarker[]>(() => {
        if (!showBusinesses) return [];

        const result: DisplayClientMarker[] = [];

        // 1. Primary: Use routeDrivers (real-time progress, assigned drivers, and sequenced order)
        if (routeDrivers && routeDrivers.length > 0) {
            const driversToDisplay = selectedDriverForDetails 
                ? [selectedDriverForDetails] 
                : routeDrivers;

            for (const drv of driversToDisplay) {
                const color = drv.colorHex || driverColors[drv.driverId || ''] || '#3B82F6';
                const drvName = drv.driverName;

                (drv.clients || []).forEach((c, idx) => {
                    const pos = safeParse(c.coords);
                    if (pos) {
                        const order = c.order && c.order < 9999 ? c.order : (idx + 1);
                        result.push({
                            key: `${drvName}-${c.name}-${idx}`,
                            client: c,
                            pos,
                            driverName: drvName,
                            driverColor: color,
                            order,
                            isDelivered: !!c.isDelivered
                        });
                    }
                });
            }
        }

        // 2. Fallback: If routeDrivers has no coordinates, use active businesses from Supabase
        if (result.length === 0 && businesses && businesses.length > 0) {
            const targetRoute = selectedRoute === 'morning' ? 'Matutina' : selectedRoute === 'evening' ? 'Vespertina' : null;
            
            businesses.forEach((biz, idx) => {
                if (targetRoute && biz.routeType && biz.routeType !== targetRoute) return;
                
                let isActive = true;
                let metaDriver = '';
                let metaOrder = idx + 1;
                let metaBags = 1;
                if (biz.email) {
                    try {
                        const meta = JSON.parse(biz.email);
                        if (meta.isActive !== undefined) isActive = !!meta.isActive;
                        if (meta.driver) metaDriver = meta.driver;
                        if (meta.routeOrder) metaOrder = meta.routeOrder;
                        if (meta.bags) metaBags = meta.bags;
                    } catch(e) {}
                }

                if (!isActive) return;

                if (selectedDriverForDetails && metaDriver) {
                    if (metaDriver.toUpperCase().trim() !== selectedDriverForDetails.driverName.toUpperCase().trim()) {
                        return;
                    }
                }

                const pos = safeParse(undefined, biz.lat, biz.lng);
                if (pos) {
                    const driverColor = metaDriver ? (driverColors[metaDriver] || '#3B82F6') : '#3B82F6';
                    result.push({
                        key: `biz-${biz.id || idx}`,
                        client: {
                            name: biz.name,
                            address: biz.location || '',
                            coords: `${pos.lat}, ${pos.lng}`,
                            order: metaOrder,
                            repartidor: metaDriver || 'Sin Asignar',
                            bags: metaBags,
                            phone: biz.phone || '',
                            locationLink: biz.locationLink || '',
                            isDelivered: false
                        },
                        pos,
                        driverName: metaDriver || 'Sin Asignar',
                        driverColor,
                        order: metaOrder,
                        isDelivered: false
                    });
                }
            });
        }

        return result;
    }, [showBusinesses, routeDrivers, selectedDriverForDetails, businesses, selectedRoute, driverColors]);

    // Coordinates of currently active selected client
    const activeSelectedClientPos = useMemo(() => {
        if (!activeSelectedClient) return null;
        return safeParse(activeSelectedClient.coords);
    }, [activeSelectedClient]);

    const activeSelectedClientMarker = useMemo(() => {
        if (!activeSelectedClient) return null;
        return clientMarkers.find(m => 
            m.client.name === activeSelectedClient.name && 
            m.client.repartidor === activeSelectedClient.repartidor
        );
    }, [clientMarkers, activeSelectedClient]);

    return (
        <div className="w-full h-full relative">
            <Map
                defaultCenter={DEFAULT_CENTER}
                defaultZoom={12}
                mapId="hd_map_id"
                disableDefaultUI={true}
                streetViewControl={true}
                className={`w-full h-full ${selectingFor ? 'cursor-crosshair' : ''}`}
                style={{ width: '100%', height: '100%' }}
                onClick={(e) => {
                    if (selectingFor && onMapClick && e.detail.latLng) {
                        onMapClick(e.detail.latLng.lat, e.detail.latLng.lng);
                    }
                }}
                onDblclick={(e) => {
                    if (selectingFor && onMapClick && e.detail.latLng) {
                        onMapClick(e.detail.latLng.lat, e.detail.latLng.lng);
                    }
                }}
            >
                {/* Auto Bounds and Centering Controller */}
                <MapBoundsAdjuster
                    targetPosition={activeSelectedClientPos}
                    allPoints={clientMarkers.map(m => m.pos)}
                    viewKey={`${selectedRoute}-${selectedDriverForDetails?.driverName || 'all'}-${clientMarkers.length}`}
                    isDispatchOpen={isDispatchOpen}
                />

                {/* KML Layer from Google My Maps (if provided) */}
                {kmlUrl && <KmlOverlay kmlUrl={kmlUrl} />}

                {/* Real-time Traffic Layer */}
                {showTraffic && <TrafficLayer />}

                {/* Active Trips Routes and Markers */}
                {activeTrips.map((trip, index) => {
                    const isSelected = trip.id === selectedTripId;
                    if (!isSelected) {
                        return <React.Fragment key={trip.id}></React.Fragment>;
                    }

                    const tripColor = TRIP_COLORS[index % TRIP_COLORS.length];

                    return (
                        <React.Fragment key={trip.id}>
                            {trip.originLat && trip.destLat && (
                                <TripRoute
                                    originLat={trip.originLat!}
                                    originLng={trip.originLng!}
                                    destLat={trip.destLat!}
                                    destLng={trip.destLng!}
                                    color={tripColor}
                                    waypoints={trip.stops?.map(s => ({ lat: s.lat, lng: s.lng })) || []}
                                />
                            )}

                            {trip.originLat && trip.originLng && (
                                <AdvancedMarker position={{ lat: trip.originLat, lng: trip.originLng }} zIndex={20}>
                                    <div className="flex flex-col items-center group cursor-pointer relative">
                                        <Pin background={tripColor} glyphColor={'white'} borderColor={'#ffffff'} scale={1.1} />
                                        <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-white px-3 py-2 rounded-lg shadow-xl text-xs font-bold whitespace-nowrap min-w-[120px] z-[60] border-2" style={{ borderColor: tripColor }}>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-gray-900 leading-tight">📍 {trip.clientName}</span>
                                                <span className="text-gray-500 font-normal leading-tight text-[10px] truncate max-w-[150px]">{trip.origin}</span>
                                            </div>
                                            <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px]" style={{ borderTopColor: tripColor }}></div>
                                        </div>
                                    </div>
                                </AdvancedMarker>
                            )}

                            {trip.destLat && trip.destLng && (
                                <AdvancedMarker position={{ lat: trip.destLat, lng: trip.destLng }} zIndex={20}>
                                    <div className="flex flex-col items-center group cursor-pointer relative">
                                        <div className="bg-white p-1.5 rounded-full shadow-lg border-2" style={{ borderColor: tripColor }}>
                                            <span className="material-symbols-outlined text-xl font-bold" style={{ color: tripColor }}>flag</span>
                                        </div>
                                        <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-[60] transition-opacity pointer-events-none">
                                            Destino: {trip.clientName}
                                        </div>
                                    </div>
                                </AdvancedMarker>
                            )}
                        </React.Fragment>
                    );
                })}

                {/* Driver Live Positions */}
                {Object.keys(driverPositions).map((driverId) => {
                    const pos = driverPositions[driverId];
                    if (!pos || isNaN(pos.lat) || isNaN(pos.lng) || pos.lat === 0 || pos.lng === 0) {
                        return null;
                    }

                    let hash = 0;
                    for (let i = 0; i < driverId.length; i++) hash = driverId.charCodeAt(i) + ((hash << 5) - hash);
                    const fallbackColor = TRIP_COLORS[Math.abs(hash) % TRIP_COLORS.length];
                    const driverColor = driverColors[driverId] || fallbackColor;
                    
                    return (
                        <AdvancedMarker key={`driver-${driverId}`} position={{ lat: pos.lat, lng: pos.lng }} zIndex={60}>
                            <div className="flex flex-col items-center group cursor-pointer relative">
                                <div className="absolute bottom-10 bg-black/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[70] shadow-xl border border-white/20">
                                    {driverNames[driverId] || 'Repartidor'}
                                </div>
                                
                                <div 
                                    className="relative flex items-center justify-center w-9 h-9 bg-white rounded-full shadow-xl border-2 z-10 transition-transform duration-1000 ease-out"
                                    style={{ borderColor: driverColor, transform: `rotate(${pos.heading || 0}deg)` }}
                                >
                                    <span className="material-symbols-outlined text-[20px]" style={{ color: driverColor, fontVariationSettings: "'FILL' 1" }}>
                                        navigation
                                    </span>
                                </div>
                            </div>
                        </AdvancedMarker>
                    );
                })}

                {/* Base / Fleet Units */}
                {showUnits && units.map((unit) => (
                    <AdvancedMarker key={unit.id} position={{ lat: unit.lat, lng: unit.lng }} zIndex={10}>
                        <Pin background={'#059669'} glyphColor={'white'} borderColor={'#ffffff'} scale={0.8} />
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-white px-2 py-1 rounded shadow text-xs font-bold whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity pointer-events-none z-10 border border-green-700">
                            {unit.name} (Base)
                        </div>
                    </AdvancedMarker>
                ))}

                {/* Clientes de la Ruta Activa */}
                {clientMarkers.map((m) => {
                    const isSelected = activeSelectedClient && (
                        activeSelectedClient.name === m.client.name && 
                        activeSelectedClient.repartidor === m.client.repartidor
                    );

                    return (
                        <AdvancedMarker
                            key={m.key}
                            position={m.pos}
                            zIndex={isSelected ? 100 : (m.isDelivered ? 15 : 30)}
                            onClick={() => {
                                if (onSelectClient) onSelectClient(m.client);
                                else setInternalSelectedClient(m.client);
                            }}
                        >
                            <div className={`relative flex flex-col items-center group cursor-pointer transition-all duration-200 ${isSelected ? 'scale-125 z-50' : 'hover:scale-120'}`}>
                                {/* Pin Badge Circle */}
                                <div 
                                    className={`min-w-[26px] h-[26px] px-1 rounded-full flex items-center justify-center font-black text-[10px] text-white shadow-lg border-2 ${
                                        m.isDelivered
                                            ? 'bg-emerald-600 border-white ring-2 ring-emerald-400/60'
                                            : 'border-white'
                                    }`}
                                    style={{ 
                                        backgroundColor: m.isDelivered ? '#059669' : m.driverColor,
                                        boxShadow: `0 4px 10px ${m.driverColor}80`
                                    }}
                                >
                                    {m.isDelivered ? (
                                        <span className="material-symbols-outlined text-[14px]">check</span>
                                    ) : (
                                        <span>{m.order}</span>
                                    )}
                                </div>

                                {/* Pin pointer tip */}
                                <div 
                                    className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px]"
                                    style={{ borderTopColor: m.isDelivered ? '#059669' : m.driverColor }}
                                />

                                {/* Mini hover tooltip card */}
                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center pointer-events-none z-[120] whitespace-nowrap">
                                    <div className="bg-[#0f172a]/95 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg shadow-2xl border border-white/20 backdrop-blur-md flex flex-col gap-0.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.driverColor }}></span>
                                            <span className="text-gray-300 font-normal text-[10px] uppercase tracking-wider">{m.driverName} • #{m.order}</span>
                                            {m.isDelivered ? (
                                                <span className="text-emerald-400 text-[10px] font-bold">✓ Entregado</span>
                                            ) : (
                                                <span className="text-amber-400 text-[10px] font-bold">⏳ Pendiente</span>
                                            )}
                                        </div>
                                        <div className="text-white font-extrabold text-xs">
                                            {m.client.name}
                                        </div>
                                        {m.client.bags > 0 && (
                                            <div className="text-pink-400 font-bold text-[10px] flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[11px]">shopping_bag</span>
                                                {m.client.bags} {m.client.bags === 1 ? 'bolsa' : 'bolsas'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </AdvancedMarker>
                    );
                })}

                {/* InfoWindow Popup for Selected Client */}
                {activeSelectedClient && activeSelectedClientPos && (
                    <InfoWindow
                        position={activeSelectedClientPos}
                        onCloseClick={() => {
                            if (onSelectClient) onSelectClient(null);
                            setInternalSelectedClient(null);
                        }}
                    >
                        <div className="p-2 text-gray-900 min-w-[230px] max-w-[290px] font-sans">
                            <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span 
                                        className="w-2.5 h-2.5 rounded-full shrink-0" 
                                        style={{ backgroundColor: activeSelectedClientMarker?.driverColor || '#3B82F6' }}
                                    />
                                    <span className="text-[11px] font-black uppercase tracking-wider text-gray-600 truncate">
                                        {activeSelectedClient.repartidor || activeSelectedClientMarker?.driverName || 'Repartidor'} • #{activeSelectedClient.order || activeSelectedClientMarker?.order || 1}
                                    </span>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                                    activeSelectedClient.isDelivered 
                                        ? 'bg-emerald-100 text-emerald-800' 
                                        : 'bg-amber-100 text-amber-800'
                                }`}>
                                    {activeSelectedClient.isDelivered ? 'Entregado' : 'Pendiente'}
                                </span>
                            </div>

                            <h4 className="font-bold text-sm text-gray-900 leading-tight mb-1">
                                {activeSelectedClient.name}
                            </h4>

                            {activeSelectedClient.bags > 0 && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 border border-pink-200 text-pink-700 text-[11px] font-bold rounded mb-2">
                                    <span className="material-symbols-outlined text-[13px]">shopping_bag</span>
                                    {activeSelectedClient.bags} {activeSelectedClient.bags === 1 ? 'bolsa' : 'bolsas'}
                                </div>
                            )}

                            {activeSelectedClient.address && (
                                <p className="text-xs text-gray-600 mb-2 leading-relaxed flex items-start gap-1">
                                    <span className="material-symbols-outlined text-[14px] text-red-500 shrink-0 mt-0.5">location_on</span>
                                    <span className="line-clamp-2">{activeSelectedClient.address}</span>
                                </p>
                            )}

                            {activeSelectedClient.phone && (
                                <div className="flex items-center gap-2 mb-2.5">
                                    <a 
                                        href={`https://wa.me/52${activeSelectedClient.phone.replace(/\D/g, '')}`} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 transition-colors"
                                    >
                                        <span>WhatsApp</span>
                                    </a>
                                    <a 
                                        href={`tel:${activeSelectedClient.phone}`}
                                        className="text-[11px] font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded border border-blue-200 transition-colors"
                                    >
                                        <span>Llamar</span>
                                    </a>
                                </div>
                            )}

                            <div className="pt-2 border-t border-gray-100 flex gap-2">
                                <a 
                                    href={activeSelectedClient.locationLink || `https://www.google.com/maps/search/?api=1&query=${activeSelectedClientPos.lat},${activeSelectedClientPos.lng}`}
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-center text-xs font-bold transition-colors"
                                >
                                    Abrir en Google Maps ↗
                                </a>
                            </div>
                        </div>
                    </InfoWindow>
                )}

                {/* Preview Pins for New Trip */}
                {previewOrigin && previewOrigin.lat !== 0 && (
                    <AdvancedMarker position={previewOrigin} zIndex={50}>
                        <Pin background={'#2563eb'} glyphColor={'white'} borderColor={'#ffffff'} scale={1.8} />
                    </AdvancedMarker>
                )}
                {previewDest && previewDest.lat !== 0 && (
                    <AdvancedMarker position={previewDest} zIndex={50}>
                        <Pin background={'#dc2626'} glyphColor={'white'} borderColor={'#ffffff'} scale={1.8} />
                    </AdvancedMarker>
                )}

                {/* Preview Route Renderer for New Trip */}
                {previewOrigin && previewDest && (
                    <TripRoute 
                        originLat={previewOrigin.lat} 
                        originLng={previewOrigin.lng} 
                        destLat={previewDest.lat} 
                        destLng={previewDest.lng} 
                        color="#2563eb" 
                        onRoutesFound={onRoutesFound}
                        routeIndex={selectedRouteIndex}
                        showAlternatives={true}
                        waypoints={previewStops?.map(s => ({ lat: s.lat, lng: s.lng })) || []}
                    />
                )}

                {/* Preview Stop Markers */}
                {previewStops && previewStops.map((stop, idx) => stop.lat !== 0 && (
                    <AdvancedMarker key={`stop-${idx}`} position={{ lat: stop.lat, lng: stop.lng }} zIndex={25}>
                        <div className="bg-orange-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white shadow-lg">
                            {idx + 1}
                        </div>
                    </AdvancedMarker>
                ))}

                {/* Draft Client Marker */}
                {draftMarker && draftMarker.lat !== 0 && (
                    <AdvancedMarker 
                        position={draftMarker} 
                        zIndex={100} 
                        draggable={true}
                        onDragEnd={(e) => {
                            if (e.latLng && onDraftMarkerDragEnd) {
                                onDraftMarkerDragEnd(e.latLng.lat(), e.latLng.lng());
                            }
                        }}
                    >
                        <Pin background={'#fbbf24'} glyphColor={'#000'} borderColor={'#fff'} scale={1.2}>
                            <span className="material-symbols-outlined text-[16px]">person_add</span>
                        </Pin>
                        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-amber-500 text-white px-3 py-1.5 rounded-xl shadow-2xl text-[10px] font-black whitespace-nowrap z-[110] border-2 border-white animate-bounce">
                            NUEVO CLIENTE (Ajustable)
                            <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-amber-500"></div>
                        </div>
                    </AdvancedMarker>
                )}
            </Map>
        </div>
    );
};

export default MapContent;
