import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Map, AdvancedMarker, Pin, useMapsLibrary, useMap } from '@vis.gl/react-google-maps';
import { getBusinesses, addBusiness, getUnits, getDrivers, initializeData, Business, FleetUnit, Driver, addTrip, getPricingSettings, PricingSettings, getActiveTrips, Trip, getLatestDriverLocations, updateTripStatus, updateTrip, getDestinations, Destination, getBusinessOrigins, BusinessOrigin } from '../services/dataService';

import { supabase } from '../services/supabaseClient';
import { adminSelect } from '../services/supabaseAdmin';
import { checkMapQuota, incrementMapQuota } from '../services/mapsQuotaService';
import { getCurrentUser, getCurrentUserName } from '../services/authService';
import { formatCurrency } from '../utils/format';
import { calcDistance } from '../utils/geo';
import TripRoute from '../components/TripRoute';
import AutocompleteInput from '../components/AutocompleteInput';
import MapContent from '../components/MapContent';

import { useRealtimeTracking } from '../hooks/useRealtimeTracking';
import { pushToGoogleSheets } from '../services/googleSheetsService';
import { buildDriverProgress, DriverRouteInfo } from '../services/routeMonitorService';
import { NewClientSidebar } from '../components/NewClientSidebar';
import DispatchSidebar from '../components/DispatchSidebar';
import { useAppStore } from '../store/useStore';

// CORRECCIÓN PARA VITE: Se usa import.meta.env en lugar de process.env
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const DEFAULT_CENTER = { lat: 25.6866, lng: -100.3161 }; // Monterrey/Guadalupe

// Master Sheet IDs (same as App.tsx)
const MORNING_SHEET_ID = import.meta.env.VITE_MORNING_SHEET_ID || "1fWjuO_bGy4cvO0-Ru-u2lbnJcD8ZJFg3ovTaD7kIDzE";
const EVENING_SHEET_ID = import.meta.env.VITE_EVENING_SHEET_ID || "1y7V-6nwmsJv_bY38PzjFhIFWaUPu8EW4IvQD23T008U";
const MORNING_GID = "1075208342";
const EVENING_GID = "2039339913";

// Driver colors for sidebar cards
const DRIVER_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#06B6D4', '#EC4899', '#14B8A6', '#F97316', '#6366F1'
];

const MUNICIPIOS_NL = [
    "Abasolo", "Agualeguas", "Allende", "Anáhuac", "Apodaca", "Aramberri", "Bustamante",
    "Cadereyta Jiménez", "Carmen", "Cerralvo", "China", "Ciénega de Flores", "Doctor Arroyo",
    "Doctor Coss", "Doctor González", "Galeana", "García", "General Bravo", "General Escobedo",
    "General Terán", "General Treviño", "General Zaragoza", "General Zuazua", "Guadalupe",
    "Hidalgo", "Higueras", "Hualahuises", "Iturbide", "Juárez", "Lampazos de Naranjo",
    "Linares", "Los Aldamas", "Los Herreras", "Los Ramones", "Marín", "Melchor Ocampo",
    "Mier y Noriega", "Mina", "Montemorelos", "Monterrey", "Parás", "Pesquería", "Rayones",
    "Sabinas Hidalgo", "Salinas Victoria", "San Nicolás de los Garza", "San Pedro Garza García",
    "Santa Catarina", "Santiago", "Vallecillo", "Villaldama"
].sort();

/**
 * Utility to extract coordinates from Google Maps URLs (Standard, Share, etc.)
 */
const extractCoordsFromLink = (url: string): string | null => {
    if (!url) return null;
    
    // Pattern 1: @lat,lng (Standard browser URL)
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) return `${atMatch[1]}, ${atMatch[2]}`;
    
    // Pattern 2: q=lat,lng (Search or dropped pin)
    const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) return `${qMatch[1]}, ${qMatch[2]}`;
    
    // Pattern 3: ll=lat,lng (Legacy links)
    const llMatch = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (llMatch) return `${llMatch[1]}, ${llMatch[2]}`;

    // Pattern 4: Search for digits in query string if it looks like coords but no q=
    // (e.g. maps?z=15&t=m&q=25.123,-100.123)
    const generalMatch = url.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (generalMatch && (url.includes('google.com/maps') || url.includes('goo.gl/maps'))) {
        return `${generalMatch[1]}, ${generalMatch[2]}`;
    }

    return null;
};

const FleetMonitor = () => {
    const map = useMap();
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [units, setUnits] = useState<FleetUnit[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [businessOrigins, setBusinessOrigins] = useState<BusinessOrigin[]>([]);
    const [pricing, setPricing] = useState<PricingSettings | null>(null);
    const [activeTrips, setActiveTrips] = useState<Trip[]>([]);
    const [initialDriverPositions, setInitialDriverPositions] = useState<{ [key: string]: { lat: number, lng: number, heading: number } }>({});
    const [driverNames, setDriverNames] = useState<{ [key: string]: string }>({}); // Lookup for driver names
    const [driverColors, setDriverColors] = useState<{ [key: string]: string }>({}); // Lookup for driver colors
    const [copiedTripId, setCopiedTripId] = useState<string | null>(null);

    const [currentTime, setCurrentTime] = useState(new Date());
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 2000);
    };

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 10000);
        return () => clearInterval(timer);
    }, []);

    // Filtros de visualización
    const [showBusinesses, setShowBusinesses] = useState(true);
    const [showUnits, setShowUnits] = useState(true);

    // Create Trip State â€” Sidebar mode
    const { isSidebarOpen, setSidebarOpen: setIsSidebarOpen, selectingFor, setSelectingFor, newClient, setNewClient, resetNewClient, draftMarker, setDraftMarker } = useAppStore();
    const [showDriverStatus, setShowDriverStatus] = useState(false);
    const [addressTab, setAddressTab] = useState<'origin' | 'destination'>('origin');
    const [geocoding, setGeocoding] = useState(false);
    const [selectedMapTripId, setSelectedMapTripId] = useState<string | null>(null);

    // Scheduling State
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');

    const defaultAddr = { state: 'Nuevo León', city: 'Monterrey', zipCode: '', neighborhood: '', street: '', number: '', orientation: '' };
    const [originAddr, setOriginAddr] = useState({ ...defaultAddr });
    const [destAddr, setDestAddr] = useState({ ...defaultAddr });

    const [newTrip, setNewTrip] = useState({
        origin: '', destination: '',
        stops: [] as { address: string; lat: number; lng: number }[],
        originLat: 0, originLng: 0,
        destLat: 0, destLng: 0,
        clientName: '',
        clientPhone: '',
        countryCode: '52',
        businessId: '',
        driverId: '',
    });
    const [localPricing, setLocalPricing] = useState({ baseRate: 35, kmRate: 9 });
    const [tripEstimation, setTripEstimation] = useState({ distance: 0, cost: 0 });
    const [creatingTrip, setCreatingTrip] = useState(false);
    const [createdTripId, setCreatedTripId] = useState<string | null>(null);
    const [lastCreatedTrip, setLastCreatedTrip] = useState<{ clientName: string, clientPhone: string, cost: number } | null>(null);
    const [copiedClientTripId, setCopiedClientTripId] = useState<string | null>(null);

    // Alternative Routes State
    const [routeOptions, setRouteOptions] = useState<google.maps.DirectionsRoute[]>([]);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

    // --- Route Monitor State ---
    const [selectedRoute, setSelectedRoute] = useState<'morning' | 'evening' | null>(null);
    const [routeDrivers, setRouteDrivers] = useState<DriverRouteInfo[]>([]);
    const [selectedDriverForDetails, setSelectedDriverForDetails] = useState<DriverRouteInfo | null>(null);
    const [loadingRoute, setLoadingRoute] = useState(false);
    const [showMyMap, setShowMyMap] = useState(false);
    const [myMapUrl, setMyMapUrl] = useState('');

    useEffect(() => {
        setSelectedDriverForDetails(null);
    }, [selectedRoute]);

    // --- Nearest Base Assignment ---
    const [isDispatchOpen, setIsDispatchOpen] = useState(true);
    const [selectedUnit, setSelectedUnit] = useState<FleetUnit | null>(null);
    const [nearestDistance, setNearestDistance] = useState<number>(0);
    const [manualBaseOverride, setManualBaseOverride] = useState(false);


    const extractCoordsFromLink = (link: string) => {
        const atMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (atMatch) return `${atMatch[1]}, ${atMatch[2]}`;
        const qMatch = link.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (qMatch) return `${qMatch[1]}, ${qMatch[2]}`;
        return null;
    };


    // Helper: calcula el costo de espera según tarifa del cliente (aplica a partir del min 21)
    const calcWaitCost = (minutes: number, ratePerMin: number): number => {
        if (minutes <= 20 || ratePerMin <= 0) return 0;
        return parseFloat(((minutes - 20) * ratePerMin).toFixed(2));
    };


    // --- NEW: Copy trip data to clipboard ---
    const handleCopyTrip = async (trip: Trip, e?: React.MouseEvent) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }

        const originMapLink = trip.originLat && trip.originLng
            ? `https://www.google.com/maps?q=${trip.originLat},${trip.originLng}`
            : '';
        const destMapLink = trip.destLat && trip.destLng
            ? `https://www.google.com/maps?q=${trip.destLat},${trip.destLng}`
            : '';

        const driverInfo = trip.driver && trip.driver !== 'Unknown' ? trip.driver : 'No asignado';

        const lines = [
            ...(trip.scheduledAt ? [
                `🕒 *PROGRAMADO:*`,
                `   ${new Date(trip.scheduledAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}`,
                ``
            ] : []),
            `👤 *NOMBRE:*`,
            `   ${trip.clientName || 'No especificado'}`,
            ``,
            `👤 *REPARTIDOR:*`,
            `   ${driverInfo}`,
            ``,
            `📍 *ORIGEN:*`,
            `   ${trip.origin || 'No especificado'}`,
            originMapLink ? `   🗺️ ${originMapLink}` : '',
            ``,
            ...(trip.stops && trip.stops.length > 0 ? trip.stops.flatMap((stop, idx) => [
                `📌 *PARADA ${idx + 1}:*`,
                `   ${stop.address}`,
                `   🗺️ https://www.google.com/maps?q=${stop.lat},${stop.lng}`,
                ``
            ]) : []),
            `🏁 *DESTINO${trip.stops && trip.stops.length > 0 ? ' FINAL' : ''}:*`,
            `   ${trip.destination || 'No especificado'}`,
            destMapLink ? `   🗺️ ${destMapLink}` : '',
            ``,
            `💰 *COSTO:*`,
            `   $${(trip.cost || 0).toFixed(2)}`
        ].filter(Boolean).join('\n');

        try {
            await navigator.clipboard.writeText(lines);
            setCopiedTripId(trip.id);
            setTimeout(() => setCopiedTripId(null), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = lines;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopiedTripId(trip.id);
            setTimeout(() => setCopiedTripId(null), 2000);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            initializeData();

            const { data: driversData } = await supabase.from('drivers').select('id, name, color_hex');
            const dNames: { [key: string]: string } = {};
            const dColors: { [key: string]: string } = {};
            if (driversData) {
                driversData.forEach((d: any) => {
                    dNames[d.id] = d.name;
                    if (d.color_hex) dColors[d.id] = d.color_hex;
                });
            }
            setDriverNames(dNames);
            setDriverColors(dColors);

            const [fetchedBiz, fetchedUnits, fetchedDrivers, fetchedPricing, fetchedTrips, fetchedLocations, fetchedDestinations, fetchedOrigins] = await Promise.all([
                getBusinesses(),
                getUnits(),
                getDrivers(),
                getPricingSettings(),
                getActiveTrips(),
                getLatestDriverLocations(), // Fetch initial positions
                getDestinations(),
                getBusinessOrigins()
            ]);
            setBusinesses(fetchedBiz);
            setUnits(fetchedUnits);
            setDrivers(fetchedDrivers);
            setDestinations(fetchedDestinations);
            setBusinessOrigins(fetchedOrigins);
            setPricing(fetchedPricing);
            setLocalPricing({ baseRate: fetchedPricing.baseRate, kmRate: fetchedPricing.kmRate });
            setActiveTrips(fetchedTrips);
            setInitialDriverPositions(fetchedLocations);

            // Find HD base but don't set it as default origin — only make it available for selection
            const hdBase = fetchedUnits.find((u: any) => u.name.toUpperCase().includes('HEALTHY') || u.name.toUpperCase().includes('HD')) || fetchedUnits[0] || null;
            if (hdBase) {
                setSelectedUnit(hdBase);
                // Do NOT set manualBaseOverride=true so it won't auto-use as origin
            }
        };
        loadData();
    }, []);

    // ── Realtime subscription to delivery_logs for live progress updates ──
    useEffect(() => {
        if (!selectedRoute) return;

        let isMounted = true;

        const fetchProgress = async () => {
            try {
                const { data: dbDrivers } = await supabase.from('drivers').select('id, name, color_hex, morning_sheet_url, evening_sheet_url');
                const sheetId = selectedRoute === 'morning' ? MORNING_SHEET_ID : EVENING_SHEET_ID;
                const gid = selectedRoute === 'morning' ? MORNING_GID : EVENING_GID;
                const progress = await buildDriverProgress(sheetId, gid, selectedRoute, dbDrivers || []);
                if (isMounted) setRouteDrivers(progress);
            } catch (e) {
                console.error('[Monitor] Error refreshing delivery progress:', e);
            }
        };

        const channel = supabase
            .channel('delivery-logs-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'delivery_logs' },
                () => { fetchProgress(); }
            )
            .subscribe();

        // Fallback polling every 15 seconds to ensure the sidebar stays updated
        // even if Supabase Realtime is not enabled for the table.
        const intervalId = setInterval(fetchProgress, 15000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
            supabase.removeChannel(channel);
        };
    }, [selectedRoute]);

    // Recalculate estimation when coordinates, routes, or local prices change
    useEffect(() => {
        if (newTrip.originLat && newTrip.destLat && pricing) {
            // Priority 1: Distance from selected Google Maps route
            // Priority 2: Haversine fallback approximation
            let dist = 0;
            const selectedRoute = routeOptions[selectedRouteIndex];
            if (selectedRoute?.legs?.length) {
                // Sum ALL legs (supports multi-stop routes)
                dist = selectedRoute.legs.reduce((sum: number, leg: any) => sum + (leg.distance?.value || 0), 0) / 1000;
            } else {
                // Haversine fallback: sum origin->stops->destination
                const allPoints = [
                    { lat: newTrip.originLat, lng: newTrip.originLng },
                    ...newTrip.stops,
                    { lat: newTrip.destLat, lng: newTrip.destLng }
                ];
                for (let i = 0; i < allPoints.length - 1; i++) {
                    dist += calcDistance(allPoints[i].lat, allPoints[i].lng, allPoints[i+1].lat, allPoints[i+1].lng);
                }
            }
            
            // Check if it's a commercial client with specialized rates
            const business = newTrip.businessId ? businesses.find(b => b.id === newTrip.businessId) : null;
            
            if (business && (business.baseRate0to6 || business.baseRate6to15 || business.extraKmRate)) {
                // SPECIAL COMMERCIAL PRICING
                let cost = 0;
                if (dist <= 6) {
                    cost = Number(business.baseRate0to6) || 0;
                } else if (dist <= 15) {
                    cost = Number(business.baseRate6to15) || 0;
                } else {
                    // Over 15km: Calculate total distance * extra rate (per User request: "el total de kilometros recorridos")
                    const extraRate = Number(business.extraKmRate) || 0;
                    cost = dist * extraRate;
                }
                setTripEstimation({ distance: dist, cost });
            } else {
                // STANDARD PRICING
                const cost = localPricing.baseRate + (dist * localPricing.kmRate);
                setTripEstimation({ distance: dist, cost: Math.max(cost, localPricing.baseRate) });
            }
        } else {
            setTripEstimation({ distance: 0, cost: 0 });
        }
    }, [newTrip.originLat, newTrip.destLat, pricing, localPricing, newTrip.businessId, businesses, routeOptions, selectedRouteIndex]);

    // --- NEW: Auto-find nearest base when origin changes ---
    useEffect(() => {
        if (newTrip.originLat && units.length > 0) {
            let minDist = Infinity;
            let nearest: FleetUnit | null = null;
            units.forEach(unit => {
                const d = calcDistance(newTrip.originLat, newTrip.originLng, unit.lat, unit.lng);
                if (d < minDist) {
                    minDist = d;
                    nearest = unit;
                }
            });
            if (nearest && !manualBaseOverride) {
                setSelectedUnit(nearest);
                setNearestDistance(minDist);
            }
        } else if (!newTrip.originLat) {
            setSelectedUnit(null);
            setNearestDistance(0);
        }
    }, [newTrip.originLat, newTrip.originLng, units, manualBaseOverride]);

    // Realtime Supabase (Trips only — driver locations handled by useRealtimeTracking)
    useEffect(() => {
        const tripsChannel = supabase
            .channel('global-trips-monitor')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'trips',
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const newTrip = payload.new;
                        setCreatedTripId(newTrip.id);
                        setLastCreatedTrip({ clientName: newTrip.client_name, clientPhone: newTrip.client_phone, cost: newTrip.cost });
                        setShowToast(true);
                        getActiveTrips().then(setActiveTrips);
                    } else if (payload.eventType === 'UPDATE') {
                        if (payload.new?.status !== payload.old?.status || payload.new?.cost !== payload.old?.cost) {
                            getActiveTrips().then(setActiveTrips);
                        } else {
                            setActiveTrips(prev => prev.map(t => t.id === payload.new?.id ? { ...t, driverId: payload.new?.driver_id, status: payload.new?.status } : t));
                        }
                    } else if (payload.eventType === 'DELETE') {
                        setActiveTrips(prev => prev.filter(t => t.id !== payload.old?.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(tripsChannel);
        };
    }, []);

    // ── Smooth GPS tracking with LERP interpolation ──────────────────────────
    const activeDriverIds = useMemo(
        () => {
            const ids = drivers.map(d => d.id).filter(Boolean);
            // If drivers haven't loaded yet, try to use ids from driverNames keys
            if (ids.length === 0) return Object.keys(driverNames);
            return ids;
        },
        [drivers, driverNames]
    );
    const realtimePositions = useRealtimeTracking(activeDriverIds);

    // Merge: initial static positions + real-time LERP-animated positions
    // We memoize this to prevent unnecessary re-renders of heavy components
    const driverPositions = useMemo(() => {
        const merged = { ...initialDriverPositions };
        // Overwrite with realtime animated positions
        Object.keys(realtimePositions).forEach(id => {
            merged[id] = realtimePositions[id];
        });
        return merged;
    }, [initialDriverPositions, realtimePositions]);

    // ── Polling fallback: refresh GPS positions every 5s from DB ──────────
    // This ensures positions update even if Supabase Realtime isn't enabled
    // for the driver_locations table.
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const freshLocations = await getLatestDriverLocations();
                if (Object.keys(freshLocations).length > 0) {
                    setInitialDriverPositions(freshLocations);
                }
            } catch { /* ignore polling errors */ }
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // --- Geocoding helpers ---
    const buildAddressString = (addr: typeof defaultAddr) => {
        const parts = [];
        if (addr.street) parts.push(addr.street);
        if (addr.number) parts.push(addr.number);
        if (addr.orientation) parts.push(addr.orientation);
        if (addr.neighborhood) parts.push(addr.neighborhood);
        if (addr.zipCode) parts.push(addr.zipCode);
        if (addr.city) parts.push(addr.city);
        if (addr.state) parts.push(addr.state);
        return parts.join(', ');
    };

    const geocodeAddress = async (address: string): Promise<{ lat: number, lng: number } | null> => {
        try {
            const geocoder = new google.maps.Geocoder();
            const result = await geocoder.geocode({ address, region: 'mx' });
            if (result.results[0]?.geometry?.location) {
                return { lat: result.results[0].geometry.location.lat(), lng: result.results[0].geometry.location.lng() };
            }
        } catch (e) { console.error('Geocode error:', e); }
        return null;
    };

    const reverseGeocode = async (lat: number, lng: number) => {
        try {
            const geocoder = new google.maps.Geocoder();
            const result = await geocoder.geocode({ location: { lat, lng } });
            if (result.results[0]) {
                const components = result.results[0].address_components;
                const get = (type: string) => components.find(c => c.types.includes(type))?.long_name || '';
                return {
                    street: get('route'),
                    number: get('street_number'),
                    neighborhood: get('sublocality_level_1') || get('sublocality') || get('neighborhood'),
                    zipCode: get('postal_code'),
                    city: get('locality'),
                    state: get('administrative_area_level_1'),
                    orientation: '',
                    formatted: result.results[0].formatted_address
                };
            }
        } catch (e) { console.error('Reverse geocode error:', e); }
        return null;
    };

    const handleSearchAndPin = async (target: 'origin' | 'destination') => {
        setGeocoding(true);
        const addr = target === 'origin' ? originAddr : destAddr;
        const addressStr = buildAddressString(addr);
        const coords = await geocodeAddress(addressStr);
        if (coords) {
            if (target === 'origin') {
                setNewTrip(prev => ({ ...prev, origin: addressStr, originLat: coords.lat, originLng: coords.lng }));
            } else {
                setNewTrip(prev => ({ ...prev, destination: addressStr, destLat: coords.lat, destLng: coords.lng }));
            }
        } else {
            alert('No se encontró la dirección. Verifica los datos o selecciona en el mapa.');
        }
        setGeocoding(false);
    };

    const handleMapClick = async (lat: number, lng: number) => {
        if (!selectingFor) return;

        const isOrigin = selectingFor === 'origin';
        setAddressTab(isOrigin ? 'origin' : 'destination');
        setGeocoding(true);

        const matchedBusiness = isOrigin ? businesses.find(b => Math.abs(b.lat - lat) < 0.0001 && Math.abs(b.lng - lng) < 0.0001) : undefined;
        const matchedUnit = isOrigin ? units.find(u => Math.abs(u.lat - lat) < 0.0001 && Math.abs(u.lng - lng) < 0.0001) : undefined;

        const result = await reverseGeocode(lat, lng);
        const setAddr = isOrigin ? setOriginAddr : setDestAddr;
        if (result) {
            let matchedCity = result.city;
            const findMatch = MUNICIPIOS_NL.find(m => m.toLowerCase() === result.city.toLowerCase() || result.city.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(result.city.toLowerCase()));
            if (findMatch) matchedCity = findMatch;

            setAddr({
                street: result.street,
                number: result.number,
                neighborhood: result.neighborhood,
                zipCode: result.zipCode,
                city: matchedCity,
                state: result.state || 'Nuevo León',
                orientation: ''
            });
        }

        if (isOrigin) {
            const finalOriginName = matchedBusiness ? matchedBusiness.name : (matchedUnit ? matchedUnit.name : (result?.formatted || `${lat},${lng}`));
            setNewTrip(prev => ({
                ...prev,
                origin: finalOriginName,
                originLat: lat,
                originLng: lng,
                businessId: matchedBusiness ? matchedBusiness.id : prev.businessId
            }));

            if (matchedUnit) {
                setSelectedUnit(matchedUnit);
                setNearestDistance(0);
                setManualBaseOverride(true);
            } else {
                if (manualBaseOverride) {
                    setSelectedUnit(null);
                    setManualBaseOverride(false);
                }
            }
        } else {
            setNewTrip(prev => ({ ...prev, destination: result?.formatted || `${lat},${lng}`, destLat: lat, destLng: lng }));
        }
        setSelectingFor(null);
        setGeocoding(false);
    };

    const handleCreateTrip = async (e: React.FormEvent, baseOriginName?: string) => {
        e.preventDefault();
        setCreatingTrip(true);

        try {
            // Use the override if provided (for Base Quick Start), otherwise use/build the address
            const originStr = baseOriginName || newTrip.origin || buildAddressString(originAddr);
            const destStr = newTrip.destination || buildAddressString(destAddr);

            if (!originStr || !destStr || (newTrip.originLat === 0 && !baseOriginName)) {
                alert("Por favor fija un origen y destino válidos con 'Buscar y Fijar' o seleccionando en el mapa.");
                setCreatingTrip(false);
                return;
            }

            // FIX #3: Validate scheduled time — must be at least 10 minutes from now (same-day allowed)
            if (isScheduled && scheduledDate && scheduledTime) {
                const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}:00`);
                const minAllowed = new Date(Date.now() + 10 * 60 * 1000); // now + 10 min
                if (scheduledDateTime < minAllowed) {
                    alert('La entrega programada debe ser al menos 10 minutos a partir de ahora.');
                    setCreatingTrip(false);
                    return;
                }
            }

            const fullPhone = newTrip.countryCode + newTrip.clientPhone;

            const tripId = await addTrip({
                origin: originStr,
                destination: destStr,
                origin_lat: newTrip.originLat,
                origin_lng: newTrip.originLng,
                dest_lat: newTrip.destLat,
                dest_lng: newTrip.destLng,
                clientName: newTrip.clientName,
                clientPhone: fullPhone,
                cost: tripEstimation.cost,
                distance: tripEstimation.distance,
                client: selectedUnit?.name || (newTrip.businessId ? businesses.find(b => b.id === newTrip.businessId)?.name : undefined) || undefined,
                unitId: selectedUnit?.id || undefined, // Pass selected unit ID
                businessId: newTrip.businessId || undefined, // Pass selected business ID
                driverId: newTrip.driverId || undefined, // Pass selected driver ID
                commissionAmount: tripEstimation.cost * ((selectedUnit?.isOwn ? 100 : (pricing?.commissionRate || 15)) / 100),
                neighborhood: originAddr.neighborhood,
                zipCode: originAddr.zipCode,
                city: originAddr.city,
                createdBy: getCurrentUserName() || getCurrentUser() || undefined,
                scheduledAt: isScheduled && scheduledDate && scheduledTime ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString() : undefined,
                stops: newTrip.stops.length > 0 ? newTrip.stops : undefined
            });

            if (tripId) {
                // Build Google Maps links
                const originMapLink = `https://www.google.com/maps?q=${newTrip.originLat},${newTrip.originLng}`;
                const destMapLink = `https://www.google.com/maps?q=${newTrip.destLat},${newTrip.destLng}`;

                // FIX #2: Include scheduled date/time in clipboard text for programmed trips
                const scheduledLine = isScheduled && scheduledDate && scheduledTime
                    ? `\n🗓️ *ENTREGA PROGRAMADA:*\n   ${new Date(`${scheduledDate}T${scheduledTime}:00`).toLocaleString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}\n`
                    : '';

                // Build clipboard text
                const clipboardText = [
                    scheduledLine,
                    `📍 *ORIGEN:*`,
                    `   ${originStr}`,
                    `   🗺️ ${originMapLink}`,
                    ``,
                    ...(newTrip.stops.length > 0 ? newTrip.stops.flatMap((stop, idx) => [
                        `📌 *PARADA ${idx + 1}:*`,
                        `   ${stop.address}`,
                        `   🗺️ https://www.google.com/maps?q=${stop.lat},${stop.lng}`,
                        ``
                    ]) : []),
                    `🏁 *DESTINO FINAL:*`,
                    `   ${destStr}`,
                    `   🗺️ ${destMapLink}`
                ].filter(l => l !== undefined).join('\n');

                try {
                    await navigator.clipboard.writeText(clipboardText);
                } catch (err) {
                    console.error('Error al copiar al portapapeles:', err);
                }

                setCreatedTripId(tripId);
                setLastCreatedTrip({ clientName: newTrip.clientName, clientPhone: fullPhone, cost: tripEstimation.cost });

                setSelectedMapTripId(null);
                setIsSidebarOpen(false);
                setNewTrip({ origin: '', destination: '', stops: [], originLat: 0, originLng: 0, destLat: 0, destLng: 0, clientName: '', clientPhone: '', countryCode: '52', businessId: '', driverId: '' });
                setOriginAddr({ ...defaultAddr });
                setDestAddr({ ...defaultAddr });
                
                const hdBase = units.find((u: FleetUnit) => u.name.toUpperCase().includes('HEALTHY') || u.name.toUpperCase().includes('HD')) || units[0] || null;
                setSelectedUnit(hdBase);
                setManualBaseOverride(false);
                
                setSelectingFor(null);
                setRouteOptions([]);
                setSelectedRouteIndex(0);
                setAddressTab('origin');
                setTripEstimation({ distance: 0, cost: 0 });
                setIsScheduled(false);
                setScheduledDate('');
                setScheduledTime('');
            }
        } catch (error: any) {
            console.error('Error creating trip:', error);
            const msg = error.message || error.details || JSON.stringify(error);
            alert("Error al crear la entrega: " + msg);
        }
        setCreatingTrip(false);
    };

    const sendWhatsApp = () => {
        if (!createdTripId || !lastCreatedTrip) return;
        // Format: https://wa.me/521PHONE?text=...
        const link = window.location.origin + window.location.pathname + `#/tracking/${createdTripId}`;
        const message = `Hola ${lastCreatedTrip.clientName || 'Cliente'}, sigue tu entrega en tiempo real aquí: ${link}`;
        const phone = lastCreatedTrip.clientPhone ? lastCreatedTrip.clientPhone.replace(/\D/g, '') : '';
        const waLink = phone
            ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
            : `https://wa.me/?text=${encodeURIComponent(message)}`; // Generic send if no phone
        window.open(waLink, '_blank');
    };

    const handleCopyNewTripClientLink = async () => {
        if (!createdTripId || !lastCreatedTrip) return;



        const confirmLink = `${window.location.origin}${window.location.pathname}#/confirmacion/${createdTripId}`;

        const lines = [
            `Hola ${lastCreatedTrip.clientName || ''},`,
            `El costo de tu entrega es de ${formatCurrency(lastCreatedTrip.cost || 0)}.`,
            ``,
            `Por favor, confirma el costo en el siguiente enlace para proceder con el servicio:`,
            confirmLink
        ].join('\n');

        try {
            await navigator.clipboard.writeText(lines);
            alert('Enlace de confirmación copiado al portapapeles.');
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = lines;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('Enlace de confirmación copiado al portapapeles.');
        }
    };

    const handleCopyClientLinkSidebar = async (trip: Trip, e: React.MouseEvent) => {
        e.stopPropagation();



        const confirmLink = `${window.location.origin}${window.location.pathname}#/confirmacion/${trip.id}`;

        const lines = [
            `Hola ${trip.clientName || ''},`,
            `El costo de tu entrega es de ${formatCurrency(trip.cost || 0)}.`,
            ``,
            `Por favor, confirma el costo en el siguiente enlace para proceder con el servicio:`,
            confirmLink
        ].join('\n');

        try {
            await navigator.clipboard.writeText(lines);
            setCopiedClientTripId(trip.id);
            setTimeout(() => setCopiedClientTripId(null), 2000);
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = lines;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopiedClientTripId(trip.id);
            setTimeout(() => setCopiedClientTripId(null), 2000);
        }
    };



    return (
        <div className="relative flex-1 h-full w-full bg-[#121118] overflow-hidden">
            <div className="absolute inset-0 w-full h-full">
                        <MapContent
                            selectedTripId={selectedMapTripId}
                            activeTrips={activeTrips}
                            driverPositions={driverPositions}
                            driverNames={driverNames}
                            driverColors={driverColors}
                            businesses={businesses}
                            units={units}
                            showBusinesses={showBusinesses}
                            showUnits={showUnits}
                            onMapClick={handleMapClick}
                            selectingFor={selectingFor}
                            previewOrigin={newTrip.originLat ? { lat: newTrip.originLat, lng: newTrip.originLng } : null}
                            previewDest={newTrip.destLat ? { lat: newTrip.destLat, lng: newTrip.destLng } : null}
                            onRoutesFound={setRouteOptions}
                            selectedRouteIndex={selectedRouteIndex}
                            previewStops={newTrip.stops}
                            draftMarker={draftMarker}
                            onDraftMarkerDragEnd={(lat, lng) => {
                                setNewClient({ coords: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
                                setDraftMarker({ lat, lng });
                            }}
                            kmlUrl={showMyMap ? myMapUrl : null}
                        />

                        {/* Sidebar: Nueva Entrega */}
                        {/* Sidebar: Nuevo Pedido */}
                        <NewClientSidebar showToast={showToast} setBusinesses={setBusinesses} />
                        {/* End Sidebar */}

            </div>


            {/* Toast eliminado — ya no aparece al crear una entrega */}

            {/* Buscador superior y Botón Crear */}
            <div className="absolute top-6 left-6 z-[600] flex gap-4">
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="h-12 px-4 bg-primary hover:bg-primary-hover text-white rounded-lg shadow-lg flex items-center gap-2 font-bold transition-transform active:scale-95 border border-white/10"
                >
                    <span className="material-symbols-outlined">person_add</span>
                    <span className="hidden sm:inline">Nuevo Cliente</span>
                </button>

                <div className="relative">
                    <button
                        onClick={() => setShowDriverStatus(!showDriverStatus)}
                        className={`h-12 px-4 rounded-lg shadow-lg flex items-center gap-2 font-bold transition-colors border border-white/10 ${showDriverStatus ? 'bg-indigo-600 text-white' : 'bg-black/50 hover:bg-black/70 text-indigo-200'}`}
                        title="Estatus de Repartidores"
                    >
                        <span className="material-symbols-outlined">groups</span>
                        <span className="hidden sm:inline">Repartidores</span>
                    </button>
                    {showDriverStatus && (
                        <div className="absolute top-full left-0 mt-2 w-72 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 z-[800]">
                            <h3 className="text-white text-xs font-bold uppercase tracking-widest px-2 py-2 border-b border-white/10 mb-2">Estado de Repartidores</h3>
                            <div className="max-h-64 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                {drivers.map(ds => {
                                    const assignment = activeTrips.find(t => t.driverId === ds.id && t.status === 'En Progreso');
                                    return (
                                        <div key={ds.id} className="flex justify-between items-center py-2 px-2 hover:bg-white/5 rounded-lg border-b border-white/5 last:border-0">
                                            <div className="flex-1 min-w-0 pr-2">
                                                <p className="text-white text-sm font-semibold truncate">{ds.name}</p>
                                                <p className="text-gray-400 text-[10px] truncate">{ds.vehicleModel || 'Sin vehículo'}</p>
                                            </div>
                                            <div>
                                                {assignment ? (
                                                    <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-1 rounded font-bold border border-red-500/30 whitespace-nowrap">Ocupado</span>
                                                ) : (
                                                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-1 rounded font-bold border border-emerald-500/30 whitespace-nowrap">Disponible</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Route Selector Buttons — Bottom Left */}
            <div className="absolute bottom-6 left-6 z-[600]">
                <div className="p-1.5 rounded-xl flex items-center gap-1.5 shadow-2xl bg-[#1a1a2e]/90 backdrop-blur-xl border border-white/[0.08]">
                    <button
                        onClick={async () => {
                            const newRoute = selectedRoute === 'morning' ? null : 'morning';
                            setSelectedRoute(newRoute);
                            if (newRoute) {
                                setLoadingRoute(true);
                                setIsDispatchOpen(true);
                                try {
                                    const { data: dbDrivers } = await supabase.from('drivers').select('id, name, color_hex, morning_sheet_url, evening_sheet_url');
                                    const progress = await buildDriverProgress(MORNING_SHEET_ID, MORNING_GID, 'morning', dbDrivers || []);
                                    setRouteDrivers(progress);
                                    // Fetch master map URL from destinations table (Mapas menu)
                                    const allMaps = await adminSelect('destinations');
                                    const mapEntry = allMaps?.find((m: any) => m.morning_map_url && m.morning_map_url.length > 5);
                                    if (mapEntry) {
                                        setMyMapUrl(mapEntry.morning_map_url);
                                        setShowMyMap(true);
                                    }
                                } catch (e) { console.error(e); }
                                setLoadingRoute(false);
                            } else {
                                setRouteDrivers([]);
                                setShowMyMap(false);
                            }
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 font-semibold text-sm ${selectedRoute === 'morning'
                            ? 'bg-amber-500/20 border border-amber-400/30 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                            : 'bg-white/[0.04] border border-transparent text-gray-400 hover:bg-white/[0.08] hover:text-gray-200'}`}
                    >
                        <span className="text-base">☀️</span>
                        <span>Matutina</span>
                    </button>
                    <button
                        onClick={async () => {
                            const newRoute = selectedRoute === 'evening' ? null : 'evening';
                            setSelectedRoute(newRoute);
                            if (newRoute) {
                                setLoadingRoute(true);
                                setIsDispatchOpen(true);
                                try {
                                    const { data: dbDrivers } = await supabase.from('drivers').select('id, name, color_hex, morning_sheet_url, evening_sheet_url');
                                    const progress = await buildDriverProgress(EVENING_SHEET_ID, EVENING_GID, 'evening', dbDrivers || []);
                                    setRouteDrivers(progress);
                                    // Fetch master map URL from destinations table (Mapas menu)
                                    const allMaps = await adminSelect('destinations');
                                    const mapEntry = allMaps?.find((m: any) => m.evening_map_url && m.evening_map_url.length > 5);
                                    if (mapEntry) {
                                        setMyMapUrl(mapEntry.evening_map_url);
                                        setShowMyMap(true);
                                    }
                                } catch (e) { console.error(e); }
                                setLoadingRoute(false);
                            } else {
                                setRouteDrivers([]);
                                setShowMyMap(false);
                            }
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 font-semibold text-sm ${selectedRoute === 'evening'
                            ? 'bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                            : 'bg-white/[0.04] border border-transparent text-gray-400 hover:bg-white/[0.08] hover:text-gray-200'}`}
                    >
                        <span className="text-base">🌙</span>
                        <span>Vespertina</span>
                    </button>
                </div>
            </div>

            <DispatchSidebar 
                isDispatchOpen={isDispatchOpen}
                setIsDispatchOpen={setIsDispatchOpen}
                selectedRoute={selectedRoute}
                activeTrips={activeTrips}
                setActiveTrips={setActiveTrips}
                routeDrivers={routeDrivers}
                selectedDriverForDetails={selectedDriverForDetails}
                setSelectedDriverForDetails={setSelectedDriverForDetails}
                driverColors={driverColors}
                businesses={businesses}
                drivers={drivers}
                selectedMapTripId={selectedMapTripId}
                setSelectedMapTripId={setSelectedMapTripId}
                updateTrip={updateTrip}
                updateTripStatus={updateTripStatus}

                showToast={showToast}
                handleCopyClientLinkSidebar={handleCopyClientLinkSidebar}
                handleCopyTrip={handleCopyTrip}
                copiedClientTripId={copiedClientTripId}
                copiedTripId={copiedTripId}
                calcWaitCost={calcWaitCost}
            />
        </div>
    );
};

export default FleetMonitor;
