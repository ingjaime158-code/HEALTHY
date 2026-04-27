/// <reference types="vite/client" />
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { supabase } from '../services/supabaseClient';
import { checkMapQuota, incrementMapQuota } from '../services/mapsQuotaService';

const DEFAULT_CENTER = { lat: 25.6866, lng: -100.3161 }; // Monterrey

// Try to get API Key from various likely sources
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";

// ── LERP Math ─────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function easeInOutCubic(t: number): number { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function clamp(v: number, min: number, max: number): number { return Math.min(Math.max(v, min), max); }
function lerpAngle(a: number, b: number, t: number): number {
    const delta = ((b - a + 540) % 360) - 180;
    return ((a + delta * t) + 360) % 360;
}
const LERP_DURATION = 2500;

interface TripData {
    id: string;
    origin_lat: number;
    origin_lng: number;
    dest_lat: number;
    dest_lng: number;
    origin: string;
    destination: string;
    status: string;
    driver: {
        id: string;
        name: string;
        vehicle_model?: string;
        license_plate?: string;
        color_hex?: string;
    };
    unit: {
        name: string;
    }
    stops: { address: string; lat: number; lng: number }[];
}

const Directions = ({ originLat, originLng, destLat, destLng }: { originLat: number, originLng: number, destLat: number, destLng: number }) => {
    const map = useMap();
    const routesLibrary = useMapsLibrary('routes');
    const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
    const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);

    useEffect(() => {
        if (!routesLibrary || !map) return;
        setDirectionsService(new routesLibrary.DirectionsService());
        setDirectionsRenderer(new routesLibrary.DirectionsRenderer({ map, suppressMarkers: true })); // Suppress default markers
    }, [routesLibrary, map]);

    useEffect(() => {
        if (!directionsService || !directionsRenderer) return;

        const origin = { lat: originLat, lng: originLng };
        const destination = { lat: destLat, lng: destLng };

        if (!checkMapQuota()) {
            console.warn("Quota exceeded, skipping Directions request");
            return;
        }

        incrementMapQuota();

        directionsService.route({
            origin,
            destination,
            travelMode: google.maps.TravelMode.DRIVING
        }).then(response => {
            directionsRenderer.setDirections(response);
        }).catch(e => console.error("Directions request failed", e));
    }, [directionsService, directionsRenderer, originLat, originLng, destLat, destLng]);

    return null;
};

const TripTracking = () => {
    const { tripId } = useParams<{ tripId: string }>();
    const [trip, setTrip] = useState<TripData | null>(null);
    const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number; heading?: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ── LERP animation state ──────────────────────────────────────────────
    const animRef = useRef<{
        current: { lat: number; lng: number; heading: number };
        target: { lat: number; lng: number; heading: number };
        startTime: number;
    } | null>(null);
    const rafRef = useRef<number>(0);

    const handleNewPosition = useCallback((lat: number, lng: number, heading: number) => {
        const now = performance.now();
        const existing = animRef.current;

        // Skip near-duplicate
        if (existing) {
            const dLat = Math.abs(existing.target.lat - lat);
            const dLng = Math.abs(existing.target.lng - lng);
            if (dLat < 0.00001 && dLng < 0.00001) return;
        }

        const currentPos = existing ? (() => {
            const elapsed = now - existing.startTime;
            const t = easeInOutCubic(clamp(elapsed / LERP_DURATION, 0, 1));
            return {
                lat: lerp(existing.current.lat, existing.target.lat, t),
                lng: lerp(existing.current.lng, existing.target.lng, t),
                heading: lerpAngle(existing.current.heading, existing.target.heading, t),
            };
        })() : { lat, lng, heading };

        animRef.current = { current: currentPos, target: { lat, lng, heading }, startTime: now };
    }, []);

    // ── 60fps animation loop ──────────────────────────────────────────────
    useEffect(() => {
        let running = true;
        const tick = () => {
            if (!running) return;
            const entry = animRef.current;
            if (entry) {
                const elapsed = performance.now() - entry.startTime;
                const t = easeInOutCubic(clamp(elapsed / LERP_DURATION, 0, 1));
                setDriverLocation({
                    lat: lerp(entry.current.lat, entry.target.lat, t),
                    lng: lerp(entry.current.lng, entry.target.lng, t),
                    heading: lerpAngle(entry.current.heading, entry.target.heading, t),
                });
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { running = false; cancelAnimationFrame(rafRef.current); };
    }, []);

    useEffect(() => {
        if (!tripId) {
            setError("Identificador de entrega no válido.");
            setLoading(false);
            return;
        }

        const fetchTripDetails = async () => {
            try {
                const { data, error } = await supabase
                    .from('trips')
                    .select(`
                        *,
                        drivers (id, name, vehicle_model, license_plate, color_hex),
                        units (name)
                    `)
                    .eq('id', tripId)
                    .single();

                if (error || !data) {
                    console.error("Error fetching trip:", error);
                    setError("No se encontró la entrega o ha finalizado.");
                    setLoading(false);
                    return;
                }

                const tripData: TripData = {
                    id: data.id,
                    origin_lat: Number(data.origin_lat) || DEFAULT_CENTER.lat,
                    origin_lng: Number(data.origin_lng) || DEFAULT_CENTER.lng,
                    dest_lat: Number(data.dest_lat) || DEFAULT_CENTER.lat + 0.05,
                    dest_lng: Number(data.dest_lng) || DEFAULT_CENTER.lng + 0.05,
                    origin: data.origin,
                    destination: data.destination,
                    status: data.status,
                    driver: {
                        id: data.drivers?.id || '',
                        name: data.drivers?.name || 'Repartidor Asignado',
                        vehicle_model: data.drivers?.vehicle_model,
                        license_plate: data.drivers?.license_plate,
                        color_hex: data.drivers?.color_hex
                    },
                    unit: {
                        name: data.units?.name || 'Unidad'
                    },
                    stops: (() => {
                        try {
                            if (Array.isArray(data.stops)) return data.stops;
                            if (typeof data.stops === 'string') return JSON.parse(data.stops || '[]');
                        } catch { }
                        return [];
                    })()
                };

                setTrip(tripData);
                handleNewPosition(tripData.origin_lat, tripData.origin_lng, 0);
                setLoading(false);

                // ── Subscribe to BOTH sources for driver location ─────────
                const driverId = data.drivers?.id;
                if (!driverId) return;

                // Source 1: Broadcast (instant, ~50ms)
                const broadcastChannel = supabase
                    .channel(`gps:${driverId}`)
                    .on('broadcast', { event: 'location' }, (msg) => {
                        const p = msg.payload;
                        if (p?.lat && p?.lng) {
                            handleNewPosition(Number(p.lat), Number(p.lng), Number(p.heading) || 0);
                        }
                    })
                    .subscribe();

                // Source 2: postgres_changes fallback (reliable, ~500ms)
                const cdcChannel = supabase
                    .channel(`tracking-cdc-${driverId}`)
                    .on(
                        'postgres_changes',
                        {
                            event: '*',
                            schema: 'public',
                            table: 'driver_locations',
                            filter: `driver_id=eq.${driverId}`
                        },
                        (payload) => {
                            const newLoc = payload.new as any;
                            if (newLoc) {
                                handleNewPosition(Number(newLoc.lat), Number(newLoc.lng), Number(newLoc.heading) || 0);
                            }
                        }
                    )
                    .subscribe();

                return () => {
                    supabase.removeChannel(broadcastChannel);
                    supabase.removeChannel(cdcChannel);
                };
            } catch (e) {
                console.error("Crash during fetchTripDetails:", e);
                setError("Error inesperado al cargar el mapa.");
                setLoading(false);
            }
        };

        fetchTripDetails();
    }, [tripId, handleNewPosition]);

    // Map Component to handle fitting bounds
    const MapFitBoundsKey = ({ origin, dest, driver }: { origin: google.maps.LatLngLiteral, dest: google.maps.LatLngLiteral, driver: google.maps.LatLngLiteral | null }) => {
        const map = useMap();

        useEffect(() => {
            if (!map) return;
            // Simple bound fitting - can be enhanced
            if (driver) {
                map.panTo(driver);
            }
        }, [map, driver]);

        return null;
    };

    if (loading) return <div className="h-screen w-full flex items-center justify-center bg-gray-100"><p className="text-gray-500 font-medium">Cargando entrega...</p></div>;
    if (error) return <div className="h-screen w-full flex items-center justify-center bg-gray-100"><div className="bg-white p-6 rounded-xl shadow-lg border border-red-100 text-center"><span className="material-symbols-outlined text-red-500 text-4xl mb-2">error</span><p className="text-gray-800 font-bold">{error}</p></div></div>;
    if (!trip) return null;

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Header info overlay */}
            <div className="bg-white shadow-sm z-10 border-b border-gray-200">
                <div className="max-w-3xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <span className="bg-primary text-white text-xs font-bold px-2 py-1 rounded tracking-wide">EN CURSO</span>
                            <h1 className="text-lg font-bold text-gray-900">Seguimiento de Entrega</h1>
                        </div>
                        <span className="text-xs font-mono text-gray-500">{trip.unit.name} • {trip.driver.license_plate}</span>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center mt-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                            <div className="w-0.5 h-8 bg-gray-200 my-1"></div>
                            <div className="w-2.5 h-2.5 rounded-sm bg-red-500"></div>
                        </div>
                        <div className="flex-1 space-y-3">
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Origen</p>
                                <p className="text-sm font-medium text-gray-800 leading-tight">{trip.origin || 'Pendiente de ubicación...'}</p>
                            </div>
                            {trip.stops.map((stop, idx) => (
                                <div key={idx}>
                                    <p className="text-[10px] text-orange-400 font-bold uppercase">Parada {idx + 1}</p>
                                    <p className="text-sm font-medium text-gray-800 leading-tight">{stop.address}</p>
                                </div>
                            ))}
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">{trip.stops.length > 0 ? 'Destino Final' : 'Destino'}</p>
                                <p className="text-sm font-medium text-gray-800 leading-tight">{trip.destination || 'Pendiente de ubicación...'}</p>
                            </div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-right">
                            <p className="text-xs text-gray-500 font-medium">Repartidor</p>
                            <p className="text-sm font-bold text-primary">{trip.driver.name}</p>
                            <p className="text-xs text-gray-400">{trip.driver.vehicle_model}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Map */}
            <div className="flex-1 relative">
                {GOOGLE_MAPS_API_KEY ? (
                    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                        <Map
                            defaultCenter={{ lat: trip.origin_lat, lng: trip.origin_lng }}
                            defaultZoom={14}
                            mapId="hd_tracking_map_id"
                            disableDefaultUI={false}
                            className="w-full h-full"
                        >
                            <MapFitBoundsKey
                                origin={{ lat: trip.origin_lat, lng: trip.origin_lng }}
                                dest={{ lat: trip.dest_lat, lng: trip.dest_lng }}
                                driver={driverLocation}
                            />

                            <Directions
                                originLat={trip.origin_lat}
                                originLng={trip.origin_lng}
                                destLat={trip.dest_lat}
                                destLng={trip.dest_lng}
                            />

                            {/* Origin Marker */}
                            <AdvancedMarker position={{ lat: trip.origin_lat, lng: trip.origin_lng }}>
                                <div className="bg-blue-500 p-2 rounded-full border-2 border-white shadow-lg">
                                    <span className="material-symbols-outlined text-white text-sm block">trip_origin</span>
                                </div>
                            </AdvancedMarker>

                            {/* Destination Marker */}
                            <AdvancedMarker position={{ lat: trip.dest_lat, lng: trip.dest_lng }}>
                                <div className="bg-red-500 p-2 rounded-sm border-2 border-white shadow-lg">
                                    <span className="material-symbols-outlined text-white text-sm block">flag</span>
                                </div>
                            </AdvancedMarker>

                            {/* Stop Markers */}
                            {trip.stops.map((stop, idx) => (
                                <AdvancedMarker key={`stop-${idx}`} position={{ lat: stop.lat, lng: stop.lng }}>
                                    <div className="bg-orange-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white shadow-lg">
                                        {idx + 1}
                                    </div>
                                </AdvancedMarker>
                            ))}

                            {/* Driver Marker */}
                            {driverLocation && (
                                <AdvancedMarker position={driverLocation}>
                                    <div className="flex flex-col items-center group relative z-50">
                                        <div className="absolute bottom-10 bg-black/90 text-white px-2 py-1 rounded shadow text-[10px] font-bold mb-1 whitespace-nowrap opacity-100 transition-opacity z-[60]">
                                            {trip.driver.name}
                                        </div>
                                        <div
                                            className="relative flex items-center justify-center w-10 h-10 bg-white rounded-full shadow-xl border-2 z-50 transition-transform duration-500"
                                            style={{ borderColor: trip.driver.color_hex || '#3b82f6', transform: `rotate(${driverLocation.heading || 0}deg)` }}
                                        >
                                            <span className="material-symbols-outlined text-[24px]" style={{ color: trip.driver.color_hex || '#3b82f6', fontVariationSettings: "'FILL' 1" }}>
                                                navigation
                                            </span>
                                        </div>
                                    </div>
                                </AdvancedMarker>
                            )}
                        </Map>
                    </APIProvider>
                ) : (
                    <div className="flex items-center justify-center h-full bg-slate-100 text-gray-500 p-8 text-center">
                        <div>
                            <span className="material-symbols-outlined text-4xl mb-4">map</span>
                            <p>Mapa no disponible sin API Key de Google Maps.</p>
                            <p className="text-xs mt-2 text-gray-400">Las coordenadas se muestran en modo texto de depuración:</p>
                            {driverLocation && <p className="mt-2 font-mono text-xs">Repartidor: {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}</p>}
                        </div>
                    </div>
                )}
            </div>

            {/* Status Footer */}
            <div className="bg-white p-4 border-t border-gray-200">
                <div className="max-w-3xl mx-auto flex items-center gap-3 text-gray-600 text-sm">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Actualización en tiempo real activa
                </div>
            </div>
        </div>
    );
};

export default TripTracking;
