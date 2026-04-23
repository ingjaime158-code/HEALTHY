/// <reference types="vite/client" />
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { checkMapQuota, incrementMapQuota } from '../services/mapsQuotaService';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const Directions = ({ originLat, originLng, destLat, destLng, onRouteFound, waypoints = [] }: { originLat: number, originLng: number, destLat: number, destLng: number, onRouteFound?: (path: google.maps.LatLng[]) => void, waypoints?: { lat: number; lng: number }[] }) => {
    const map = useMap();
    const routesLibrary = useMapsLibrary('routes');
    const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
    const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);

    useEffect(() => {
        if (!routesLibrary || !map) return;
        setDirectionsService(new routesLibrary.DirectionsService());
        setDirectionsRenderer(new routesLibrary.DirectionsRenderer({
            map,
            suppressMarkers: true,
            polylineOptions: { strokeColor: '#170c86', strokeWeight: 5 }
        }));
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

        const request: google.maps.DirectionsRequest = {
            origin,
            destination,
            travelMode: google.maps.TravelMode.DRIVING,
            ...(waypoints.length > 0 ? {
                waypoints: waypoints.map(wp => ({ location: new google.maps.LatLng(wp.lat, wp.lng), stopover: true })),
                optimizeWaypoints: false
            } : {})
        };

        directionsService.route(request).then(response => {
            directionsRenderer.setDirections(response);
            if (onRouteFound && response.routes[0]?.overview_path) {
                onRouteFound(response.routes[0].overview_path);
            }
        }).catch(e => console.error("Directions error", e));
    }, [directionsService, directionsRenderer, originLat, originLng, destLat, destLng, JSON.stringify(waypoints)]);

    return null;
};

const DriverTracker = () => {
    const { tripId } = useParams<{ tripId: string }>();
    const [trip, setTrip] = useState<any | null>(null);
    const [status, setStatus] = useState<string>('cargando');
    const [error, setError] = useState<string | null>(null);
    const [location, setLocation] = useState<GeolocationPosition | null>(null);
    const [routePath, setRoutePath] = useState<google.maps.LatLng[] | null>(null); // Store route path
    const watchId = useRef<number | null>(null);
    const lastUpdate = useRef<number>(0);

    // Initial load & Auto-Start Tracking
    useEffect(() => {
        if (!tripId) {
            setError("ID de entrega no válido");
            return;
        }

        const fetchTrip = async () => {
            const { data, error } = await supabase
                .from('trips')
                .select('id, status, driver_id, origin, destination, origin_lat, origin_lng, dest_lat, dest_lng, stops')
                .eq('id', tripId)
                .single();

            if (error || !data) {
                setError("La entrega no existe o ha finalizado.");
                return;
            }

            if (data.status !== 'En Progreso') {
                setError("Esta entrega no está activa actualmente.");
                setStatus('inactivo');
                return;
            }

            setTrip({
                ...data,
                parsedStops: (() => {
                    try {
                        if (Array.isArray(data.stops)) return data.stops;
                        if (typeof data.stops === 'string') return JSON.parse(data.stops || '[]');
                    } catch { }
                    return [];
                })()
            });
            // Auto start tracking once data is confirmed valid
            startTracking(data);
        };

        fetchTrip();

        // Cleanup on unmount
        return () => stopTracking();
    }, [tripId]);

    // Helper to report location to Supabase
    const reportLocation = async (lat: number, lng: number, heading: number, speed: number) => {
        if (!trip?.driver_id) return;

        // Throttle updates (every 5 seconds)
        const now = Date.now();
        if (now - lastUpdate.current > 5000) {
            lastUpdate.current = now;

            const { error } = await supabase.rpc('api_update_driver_location', {
                p_driver_id: trip.driver_id,
                p_trip_id: trip.id,
                p_lat: lat,
                p_lng: lng,
                p_heading: heading,
                p_speed: speed
            });

            if (error) console.error("Error enviando ubicación:", error);
        }
    };

    const startTracking = (tripData: any) => {
        // ERROR PREVENTION: If we are already simulating, DO NOT start real GPS tracking
        // This prevents the "blurred error overlay" from appearing on top of the simulation
        if (status === 'simulando') return;

        if (!navigator.geolocation) {
            setError("Tu navegador no soporta geolocalización.");
            return;
        }

        setStatus('rastreando');
        lastUpdate.current = 0;

        watchId.current = navigator.geolocation.watchPosition(
            async (position) => {
                setError(null);
                setLocation(position);

                await reportLocation(
                    position.coords.latitude,
                    position.coords.longitude,
                    position.coords.heading || 0,
                    position.coords.speed || 0
                );
            },
            (err) => {
                console.error("Error de geolocalización:", err);

                let errorMessage = "No se pudo acceder a tu ubicación.";
                switch (err.code) {
                    case 1: errorMessage = "Permiso de ubicación denegado. Actívalo en el navegador."; break;
                    case 2: errorMessage = "Ubicación no disponible. Verifica tu GPS."; break;
                    case 3: errorMessage = "Tardando demasiado en obtener ubicación..."; break;
                    default: errorMessage = `Error de ubicación: ${err.message}`;
                }

                setError(errorMessage);
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
        );
    };

    // Advanced Simulation Mode calling actual route
    const startSimulation = () => {
        if (!trip) return;

        // STOP any existing tracking/watchers explicitly
        // We must clear both because we reuse the same ref variable
        if (watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
            clearInterval(watchId.current);
            watchId.current = null;
        }

        // If we don't have the route path yet, we can't do advanced simulation
        // Fallback or wait? For now let's assume routePath is loaded quickly after mount
        if (!routePath || routePath.length === 0) {
            console.warn("Ruta no cargada aún, intentando simulación simple...");
        }

        console.log("Iniciando modo simulación avanzado...");
        setStatus('simulando');
        setError(null);
        lastUpdate.current = 0; // Reset to allow immediate first report

        let pathIndex = 0;
        let segmentProgress = 0;
        const speedFactor = 0.05; // How fast to move along segment (0-1) per tick

        // Use local copy of path to avoid closure staleness if possible, 
        // using routePath directly is fine as it doesn't change during sim for this trip
        const path = routePath || [
            new google.maps.LatLng(Number(trip.origin_lat), Number(trip.origin_lng)),
            new google.maps.LatLng(Number(trip.dest_lat), Number(trip.dest_lng))
        ];

        // Update every 100ms for smoothness (10fps)
        watchId.current = window.setInterval(() => {
            if (!path || path.length === 0) return;

            if (pathIndex >= path.length - 1) {
                pathIndex = 0; // Loop or stop
                segmentProgress = 0;
            }

            const startPoint = path[pathIndex];
            const endPoint = path[pathIndex + 1];

            // Safety check for invalid points
            if (!startPoint || !endPoint) {
                pathIndex++;
                return;
            }

            segmentProgress += speedFactor;

            if (segmentProgress >= 1) {
                segmentProgress = 0;
                pathIndex++;
                if (pathIndex >= path.length - 1) {
                    // End of route, loop back
                    pathIndex = 0;
                }
                return; // Wait for next tick to start new segment
            }

            // Interpolate
            const lat = startPoint.lat() + (endPoint.lat() - startPoint.lat()) * segmentProgress;
            const lng = startPoint.lng() + (endPoint.lng() - startPoint.lng()) * segmentProgress;

            // Calculate Heading
            const heading = google.maps.geometry.spherical.computeHeading(startPoint, endPoint);

            const simulatedPos = {
                coords: {
                    latitude: lat,
                    longitude: lng,
                    heading: heading,
                    speed: 50, // km/h
                    accuracy: 5,
                    altitude: 0,
                    altitudeAccuracy: 0
                },
                timestamp: Date.now()
            } as GeolocationPosition;

            setLocation(simulatedPos);
            // Non-blocking report (fire and forget inside throttling logic)
            reportLocation(lat, lng, heading, 50);

        }, 100);
    };

    const stopTracking = () => {
        if (watchId.current !== null) {
            // Check if it's an interval (simulation) or watchId (geo)
            // geolocation IDs are usually positive integers, interval IDs too.
            // Best to try clearing both or track which mode we are in.
            // For safety in this hybrid approach:
            navigator.geolocation.clearWatch(watchId.current);
            clearInterval(watchId.current);
            watchId.current = null;
        }
        setStatus('listo');
    };

    const completeTrip = async () => {
        if (!tripId) return;

        // Validate trip is still active before completing
        const { data: currentTrip, error: fetchError } = await supabase
            .from('trips')
            .select('status')
            .eq('id', tripId)
            .single();

        if (fetchError || !currentTrip || currentTrip.status !== 'En Progreso') {
            alert('Esta entrega ya fue finalizada o no existe.');
            setStatus('completado');
            return;
        }

        stopTracking();
        // Use Secure RPC to complete trip
        const { error } = await supabase.rpc('api_complete_trip', { p_trip_id: tripId });

        if (!error) {
            setStatus('completado');
        } else {
            alert("Hubo un error al finalizar la entrega.");
        }
    };

    // Helper to determine error title
    const getErrorTitle = (err: string) => {
        if (err.includes("ubicación") || err.includes("permisos")) return "Error de GPS";
        if (err.includes("entrega") || err.includes("ID")) return "Entrega No Disponible";
        return "Error del Sistema";
    };

    // We don't return early for error anymore, so the map can load in background
    // if (error) return (...) -> Moved to inside main render

    if (status === 'completado') return (
        <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
                <span className="material-symbols-outlined text-green-500 text-5xl mb-4">check_circle</span>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Entrega Finalizada</h2>
                <p className="text-gray-500">¡Gracias por tu servicio!</p>
            </div>
        </div>
    );

    if (!trip) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#111118] text-white">
            <div className="w-12 h-12 border-4 border-white/20 border-t-primary rounded-full animate-spin mb-4"></div>
            <p className="text-gray-400 font-medium">Conectando plataforma...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#111118] text-white flex flex-col relative overflow-hidden">
            {/* Map Background */}
            {trip && GOOGLE_MAPS_API_KEY && (
                <div className="absolute inset-0 z-0">
                    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                        <Map
                            defaultCenter={{ lat: Number(trip.origin_lat) || 25.6866, lng: Number(trip.origin_lng) || -100.3161 }}
                            defaultZoom={15}
                            mapId="driver_map"
                            disableDefaultUI={true}
                            className="w-full h-full"
                            style={{ filter: 'grayscale(0.2) contrast(1.1)' }}
                        >
                            <Directions
                                originLat={Number(trip.origin_lat)}
                                originLng={Number(trip.origin_lng)}
                                destLat={Number(trip.dest_lat)}
                                destLng={Number(trip.dest_lng)}
                                onRouteFound={setRoutePath}
                                waypoints={trip.parsedStops?.map((s: any) => ({ lat: s.lat, lng: s.lng })) || []}
                            />
                            {location && (
                                <AdvancedMarker position={{ lat: location.coords.latitude, lng: location.coords.longitude }}>
                                    <div className="relative flex items-center justify-center">
                                        <div className="w-4 h-4 bg-[#170c86] border-2 border-white rounded-full shadow-lg z-10"></div>
                                        <div className="absolute w-12 h-12 bg-[#170c86]/30 rounded-full animate-ping opacity-75"></div>
                                    </div>
                                </AdvancedMarker>
                            )}
                        </Map>
                    </APIProvider>
                    {/* Gradient Overlay */}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#111118] via-[#111118]/60 to-transparent pointer-events-none"></div>
                    <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#111118]/70 to-transparent pointer-events-none"></div>
                </div>
            )}

            {/* DEV DEBUG PANEL */}
            {import.meta.env.DEV && (
                <div className="absolute top-20 left-4 z-40 bg-black/50 backdrop-blur text-[10px] text-green-400 p-2 rounded border border-green-500/30 font-mono pointer-events-none">
                    <p>DEBUG MODE</p>
                    <p>Status: {status}</p>
                    <p>Route: {routePath ? `${routePath.length} pts` : 'Loading...'}</p>
                    <p>Lat: {location?.coords.latitude.toFixed(4)}</p>
                    <p>Lng: {location?.coords.longitude.toFixed(4)}</p>
                    <p>Hdg: {location?.coords.heading?.toFixed(0)}°</p>
                    <p>Spd: {location?.coords.speed?.toFixed(1)} m/s</p>
                </div>
            )}

            {/* Error Overlay - Now renders ON TOP of the map instead of replacing it */}
            {error && (
                <div className="absolute inset-0 z-50 bg-[#111118]/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center animate-in zoom-in-95 duration-200">
                        <span className={`material-symbols-outlined text-5xl mb-4 ${error.includes('ubicación') ? 'text-amber-500' : 'text-red-500'}`}>
                            {error.includes('ubicación') ? 'location_off' : 'error_outline'}
                        </span>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">{getErrorTitle(error)}</h2>
                        <p className="text-gray-500">{error}</p>

                        <div className="flex flex-col gap-2 mt-6">
                            {error.includes('ubicación') && (
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-2 bg-slate-900 text-white rounded-full text-sm font-bold hover:bg-slate-800 transition-all shadow-lg"
                                >
                                    Reintentar
                                </button>
                            )}

                            {/* Redundant button also kept here for specific error context */}
                            {import.meta.env.DEV && (
                                <button
                                    onClick={startSimulation}
                                    className="px-6 py-2 bg-indigo-100 text-indigo-700 rounded-full text-sm font-bold hover:bg-indigo-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">science</span>
                                    Simular
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="z-10 px-6 py-4 flex justify-between items-start">
                <div className="flex flex-col gap-2">
                    <div className="inline-flex items-center gap-2 bg-[#170c86]/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold border border-white/10 shadow-lg w-fit">
                        <span className="material-symbols-outlined text-sm animate-pulse">satellite_alt</span>
                        <span className="uppercase tracking-wider">En Vivo</span>
                    </div>

                    {/* Dev Mode Trigger - Always visible */}
                    {import.meta.env.DEV && !error && (
                        <button
                            onClick={startSimulation}
                            className="flex items-center gap-2 bg-indigo-600/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold border border-white/10 shadow-lg text-white hover:bg-indigo-500 transition-all w-fit"
                        >
                            <span className="material-symbols-outlined text-sm">science</span>
                            {routePath ? "Simular (Ruta)" : "Simular (Básico)"}
                        </button>
                    )}
                </div>

                <div className="px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur border border-white/10 text-xs font-mono font-bold text-emerald-400 shadow-lg">
                    {location ? `${location.coords.speed ? (location.coords.speed * 3.6).toFixed(0) : 0} km/h` : 'Waiting GPS...'}
                </div>
            </div>

            {/* Status Panel - Floating in middle/bottom */}
            <div className="flex-1 flex flex-col items-center justify-end z-10 pb-6 px-6 gap-6">

                {/* Trip Info Card */}
                <div className="w-full bg-[#1e1e2d]/90 backdrop-blur rounded-2xl p-5 border border-white/5 shadow-2xl animate-in slide-in-from-bottom-10">
                    <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Destinatario</p>
                            <h3 className="text-lg font-bold text-white leading-none">{trip.passenger_name || 'Usuario'}</h3>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[#170c86] flex items-center justify-center text-white border border-white/10">
                            <span className="material-symbols-outlined">person</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center gap-1 mt-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></div>
                                <div className="w-0.5 flex-1 bg-white/10 rounded-full min-h-[20px]"></div>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Origen</p>
                                <p className="text-sm font-medium text-gray-200 leading-snug">{trip.origin}</p>
                            </div>
                        </div>
                        {trip.parsedStops && trip.parsedStops.length > 0 && trip.parsedStops.map((stop: any, idx: number) => (
                            <div key={idx} className="flex gap-4">
                                <div className="flex flex-col items-center gap-1">
                                    <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[9px] font-black">{idx + 1}</div>
                                    <div className="w-0.5 flex-1 bg-white/10 rounded-full min-h-[10px]"></div>
                                </div>
                                <div>
                                    <p className="text-[10px] text-orange-400 uppercase font-bold tracking-wider">Parada {idx + 1}</p>
                                    <p className="text-sm font-medium text-gray-200 leading-snug">{stop.address}</p>
                                </div>
                            </div>
                        ))}
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center gap-1">
                                <span className="material-symbols-outlined text-red-400 text-lg -ml-1">location_on</span>
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{trip.parsedStops && trip.parsedStops.length > 0 ? 'Destino Final' : 'Destino'}</p>
                                <p className="text-sm font-medium text-gray-200 leading-snug">{trip.destination}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Action Button */}
                <button
                    onClick={completeTrip}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all flex items-center justify-center gap-3 text-lg border border-red-500/50"
                >
                    <span className="material-symbols-outlined text-2xl">stop_circle</span>
                    <span>Finalizar Entrega</span>
                </button>
            </div>
        </div>
    );
};

export default DriverTracker;
