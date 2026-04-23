import React from 'react';
import { Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { Trip, Business, FleetUnit } from '../services/dataService';
import TripRoute from './TripRoute';
import KmlOverlay from './KmlOverlay';

const DEFAULT_CENTER = { lat: 25.6866, lng: -100.3161 }; // Monterrey/Guadalupe

export interface MapContentProps {
    activeTrips: Trip[];
    driverPositions: { [key: string]: { lat: number, lng: number, heading: number } };
    driverNames: { [key: string]: string };
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
}

const MapContent = ({ 
    activeTrips, 
    driverPositions, 
    driverNames, 
    businesses, 
    units, 
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
    kmlUrl
}: MapContentProps) => {
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

    return (
        <div className="w-full h-full">
            <Map
                defaultCenter={DEFAULT_CENTER}
                defaultZoom={12}
                mapId="hd_map_id"
                disableDefaultUI={true}
                streetViewControl={true}
                className={`w-full h-full ${selectingFor ? 'cursor-crosshair' : ''}`}
                style={{ width: '100%', height: '100%' }}
                styles={[
                    { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
                    { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
                    { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
                    {
                        featureType: 'administrative.locality',
                        elementType: 'labels.text.fill',
                        stylers: [{ color: '#d59563' }]
                    },
                    {
                        featureType: 'poi',
                        elementType: 'labels.text.fill',
                        stylers: [{ color: '#d59563' }]
                    },
                    {
                        featureType: 'poi.park',
                        elementType: 'geometry',
                        stylers: [{ color: '#263c3f' }]
                    },
                    {
                        featureType: 'poi.park',
                        elementType: 'labels.text.fill',
                        stylers: [{ color: '#6b9a76' }]
                    },
                    {
                        featureType: 'road',
                        elementType: 'geometry',
                        stylers: [{ color: '#38414e' }]
                    },
                    {
                        featureType: 'road',
                        elementType: 'geometry.stroke',
                        stylers: [{ color: '#212a37' }]
                    },
                    {
                        featureType: 'road',
                        elementType: 'labels.text.fill',
                        stylers: [{ color: '#9ca5bbf' }]
                    },
                    {
                        featureType: 'road.highway',
                        elementType: 'geometry',
                        stylers: [{ color: '#746855' }]
                    },
                    {
                        featureType: 'road.highway',
                        elementType: 'geometry.stroke',
                        stylers: [{ color: '#1f2835' }]
                    },
                    {
                        featureType: 'road.highway',
                        elementType: 'labels.text.fill',
                        stylers: [{ color: '#f3d19c' }]
                    },
                    {
                        featureType: 'transit',
                        elementType: 'geometry',
                        stylers: [{ color: '#2f3948' }]
                    },
                    {
                        featureType: 'transit.station',
                        elementType: 'labels.text.fill',
                        stylers: [{ color: '#d59563' }]
                    },
                    {
                        featureType: 'water',
                        elementType: 'geometry',
                        stylers: [{ color: '#17263c' }]
                    },
                    {
                        featureType: 'water',
                        elementType: 'labels.text.fill',
                        stylers: [{ color: '#515c6d' }]
                    },
                    {
                        featureType: 'water',
                        elementType: 'labels.text.stroke',
                        stylers: [{ color: '#17263c' }]
                    }
                ]}
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
                {/* KML Layer from Google My Maps (syncs with zoom/pan) */}
                {kmlUrl && <KmlOverlay kmlUrl={kmlUrl} />}

                {/* Render Routes and Markers for Active Trips */}
                {activeTrips.map((trip, index) => {
                    const isSelected = trip.id === selectedTripId;
                    if (!isSelected) {
                        return <React.Fragment key={trip.id}></React.Fragment>;
                    }

                    const tripColor = TRIP_COLORS[index % TRIP_COLORS.length];

                    return (
                        <React.Fragment key={trip.id}>
                            {/* Route Line */}
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

                            {/* Origen Marker */}
                            {trip.originLat && trip.originLng && (
                                <AdvancedMarker position={{ lat: trip.originLat, lng: trip.originLng }} zIndex={20}>
                                    <Pin background={tripColor} glyphColor={'white'} borderColor={'#ffffff'} scale={1.1} />
                                    <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-white px-3 py-2 rounded-lg shadow-xl text-xs font-bold whitespace-nowrap min-w-[120px] z-[60] border-2" style={{ borderColor: tripColor }}>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-gray-900 leading-tight">📍 {trip.passengerName}</span>
                                            <span className="text-gray-500 font-normal leading-tight text-[10px] truncate max-w-[150px]">{trip.origin}</span>
                                        </div>
                                        {/* Little triangle pointer */}
                                        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white"></div>
                                    </div>
                                </AdvancedMarker>
                            )}

                            {/* Stop Markers for Active Trips */}
                            {trip.stops && trip.stops.map((stop, idx) => stop.lat !== 0 && (
                                <AdvancedMarker key={`stop-${trip.id}-${idx}`} position={{ lat: stop.lat, lng: stop.lng }} zIndex={25}>
                                    <div className="bg-orange-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white shadow-lg">
                                        {idx + 1}
                                    </div>
                                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-white px-2 py-1 rounded shadow text-[10px] font-bold whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity pointer-events-none z-60 border border-orange-500 text-gray-800">
                                        Parada {idx + 1}
                                    </div>
                                </AdvancedMarker>
                            ))}

                            {/* Destino Marker */}
                            {trip.destLat && trip.destLng && (
                                <AdvancedMarker position={{ lat: trip.destLat, lng: trip.destLng }} zIndex={15}>
                                    <div className="relative group flex flex-col items-center">
                                        {/* Destination Flag Icon Colored */}
                                        <div className="bg-white p-1.5 rounded-full shadow-lg border-2" style={{ borderColor: tripColor }}>
                                            <span className="material-symbols-outlined text-xl font-bold" style={{ color: tripColor }}>flag</span>
                                        </div>

                                        {/* Label on Hover */}
                                        <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-[60] transition-opacity pointer-events-none">
                                            Destino: {trip.passengerName}
                                        </div>
                                    </div>
                                </AdvancedMarker>
                            )}
                        </React.Fragment>
                    );
                })}

                {/* Marcadores de Choferes en Vivo */}
                {Object.keys(driverPositions).map((driverId) => {
                    const pos = driverPositions[driverId];
                    // Generar un color único y consistente basado en el UUID del chofer
                    let hash = 0;
                    for (let i = 0; i < driverId.length; i++) hash = driverId.charCodeAt(i) + ((hash << 5) - hash);
                    const driverColor = TRIP_COLORS[Math.abs(hash) % TRIP_COLORS.length];
                    
                    return (
                        <AdvancedMarker key={`driver-${driverId}`} position={{ lat: pos.lat, lng: pos.lng }} zIndex={60}>
                            <div className="flex flex-col items-center group cursor-pointer relative">
                                {/* Tooltip text (Upright) */}
                                <div className="absolute bottom-10 bg-black/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[70] shadow-xl border border-white/20">
                                    {driverNames[driverId] || 'Chofer'}
                                </div>
                                
                                {/* Vehículo (Rotado según GPS heading) */}
                                <div 
                                    className="relative flex items-center justify-center w-9 h-9 bg-white rounded-full shadow-xl border-2 z-10 transition-transform duration-1000 ease-out"
                                    style={{ borderColor: driverColor, transform: `rotate(${pos.heading || 0}deg)` }}
                                >
                                    <span className="material-symbols-outlined text-[20px]" style={{ color: driverColor }}>
                                        directions_car
                                    </span>
                                </div>
                            </div>
                        </AdvancedMarker>
                    );
                })}

                {/* Marcadores de Negocios (Hoteles) */}
                {showBusinesses && businesses.map((biz) => (
                    <AdvancedMarker key={biz.id} position={{ lat: biz.lat, lng: biz.lng }} zIndex={10}>
                        <Pin background={'#1e40af'} glyphColor={'white'} borderColor={'#ffffff'} scale={0.8} />
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-white px-2 py-1 rounded shadow text-xs font-bold whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity pointer-events-none z-10 border border-blue-800">
                            {biz.name}
                        </div>
                    </AdvancedMarker>
                ))}

                {/* Marcadores de Unidades (Estáticas/Bases) */}
                {showUnits && units.map((unit) => (
                    <AdvancedMarker key={unit.id} position={{ lat: unit.lat, lng: unit.lng }} zIndex={10}>
                        <Pin background={'#059669'} glyphColor={'white'} borderColor={'#ffffff'} scale={0.8} />
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-white px-2 py-1 rounded shadow text-xs font-bold whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity pointer-events-none z-10 border border-green-700">
                            {unit.name} (Base)
                        </div>
                    </AdvancedMarker>
                ))}

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

                {/* --- KML OVERLAY (Google My Maps routes & icons) --- */}
                {kmlUrl && <KmlOverlay kmlUrl={kmlUrl} />}
            </Map>
        </div>
    );
};

export default MapContent;
