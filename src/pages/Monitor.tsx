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
import PaymentTicket from '../components/PaymentTicket';
import { useRealtimeTracking } from '../hooks/useRealtimeTracking';
import { pushToGoogleSheets } from '../services/googleSheetsService';
import { buildDriverProgress, DriverRouteInfo } from '../services/routeMonitorService';

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
    const [copiedTripId, setCopiedTripId] = useState<string | null>(null);
    const [finishedTrip, setFinishedTrip] = useState<Trip | null>(null);
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
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showDriverStatus, setShowDriverStatus] = useState(false);
    const [addressTab, setAddressTab] = useState<'origin' | 'destination'>('origin');
    const [selectingFor, setSelectingFor] = useState<'origin' | 'destination' | null>(null);
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
        passengerName: '',
        passengerPhone: '',
        countryCode: '52',
        businessId: '',
        driverId: '',
    });
    const [localPricing, setLocalPricing] = useState({ baseRate: 35, kmRate: 9 });
    const [tripEstimation, setTripEstimation] = useState({ distance: 0, cost: 0 });
    const [creatingTrip, setCreatingTrip] = useState(false);
    const [createdTripId, setCreatedTripId] = useState<string | null>(null);
    const [lastCreatedTrip, setLastCreatedTrip] = useState<{ passengerName: string, passengerPhone: string, cost: number } | null>(null);
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

    // --- Edit Trip State (Sidebar) ---
    const [editingTripId, setEditingTripId] = useState<string | null>(null);
    const [editTripFields, setEditTripFields] = useState<{ passengerName: string; driverId: string; waitTimeMinutes: number; waitTimeCost: number; cost: number; scheduledAt?: string }>({ passengerName: '', driverId: '', waitTimeMinutes: 0, waitTimeCost: 0, cost: 0, scheduledAt: '' });
    const [editWaitRate, setEditWaitRate] = useState<number>(0); // waitRatePerMin del cliente comercial
    const [savingEdit, setSavingEdit] = useState(false);
    const [newClient, setNewClient] = useState({
        name: '',
        phone: '',
        address: '',
        locationLink: '',
        coords: ''
    });
    const [draftMarker, setDraftMarker] = useState<{lat: number, lng: number} | null>(null);

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
            `   ${trip.passengerName || 'No especificado'}`,
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

            const { data: driversData } = await supabase.from('drivers').select('id, name');
            const dNames: { [key: string]: string } = {};
            if (driversData) driversData.forEach((d: any) => dNames[d.id] = d.name);
            setDriverNames(dNames);

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
                        setLastCreatedTrip({ passengerName: newTrip.passenger_name, passengerPhone: newTrip.passenger_phone, cost: newTrip.cost });
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
    // Include ALL drivers defined in the system to ensure we listen for their signal
    const activeDriverIds = useMemo(
        () => {
            return drivers.map(d => d.id).filter(Boolean);
        },
        [drivers]
    );
    const realtimePositions = useRealtimeTracking(activeDriverIds);

    // Merge: initial static positions + real-time LERP-animated positions
    const driverPositions = useMemo(
        () => ({ ...initialDriverPositions, ...realtimePositions }),
        [initialDriverPositions, realtimePositions]
    );

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
                    alert('La carrera programada debe ser al menos 10 minutos a partir de ahora.');
                    setCreatingTrip(false);
                    return;
                }
            }

            const fullPhone = newTrip.countryCode + newTrip.passengerPhone;

            const tripId = await addTrip({
                origin: originStr,
                destination: destStr,
                origin_lat: newTrip.originLat,
                origin_lng: newTrip.originLng,
                dest_lat: newTrip.destLat,
                dest_lng: newTrip.destLng,
                passengerName: newTrip.passengerName,
                passengerPhone: fullPhone,
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
                    ? `\n🗓️ *CARRERA PROGRAMADA:*\n   ${new Date(`${scheduledDate}T${scheduledTime}:00`).toLocaleString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}\n`
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
                setLastCreatedTrip({ passengerName: newTrip.passengerName, passengerPhone: fullPhone, cost: tripEstimation.cost });

                setSelectedMapTripId(null);
                setIsSidebarOpen(false);
                setNewTrip({ origin: '', destination: '', stops: [], originLat: 0, originLng: 0, destLat: 0, destLng: 0, passengerName: '', passengerPhone: '', countryCode: '52', businessId: '', driverId: '' });
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
        const message = `Hola ${lastCreatedTrip.passengerName || 'Cliente'}, sigue tu entrega en tiempo real aquí: ${link}`;
        const phone = lastCreatedTrip.passengerPhone ? lastCreatedTrip.passengerPhone.replace(/\D/g, '') : '';
        const waLink = phone
            ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
            : `https://wa.me/?text=${encodeURIComponent(message)}`; // Generic send if no phone
        window.open(waLink, '_blank');
    };

    const handleCopyNewTripClientLink = async () => {
        if (!createdTripId || !lastCreatedTrip) return;



        const confirmLink = `${window.location.origin}${window.location.pathname}#/confirmacion/${createdTripId}`;

        const lines = [
            `Hola ${lastCreatedTrip.passengerName || ''},`,
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
            `Hola ${trip.passengerName || ''},`,
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
                                setNewClient(prev => ({ ...prev, coords: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }));
                                setDraftMarker({ lat, lng });
                            }}
                            kmlUrl={showMyMap ? myMapUrl : null}
                        />

                        {/* Sidebar: Nueva Entrega */}
                        {/* Sidebar: Nueva Carrera */}
                        <div className={`absolute top-4 left-4 bottom-4 z-[800] w-[540px] flex flex-col glass-panel bg-black/80 border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-[120%] opacity-0 pointer-events-none'}`}>
                            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
                                <button
                                    type="button"
                                    title="Limpiar todos los campos y comenzar un nuevo registro"
                                    onClick={() => {
                                        setNewClient({ name: '', phone: '', address: '', locationLink: '', coords: '' });
                                        setSelectingFor(null);
                                    }}
                                    className="flex items-center gap-2 group bg-transparent border-none outline-none cursor-pointer"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center group-hover:bg-primary/40 transition-colors">
                                        <span className="material-symbols-outlined text-primary text-[18px] group-hover:rotate-180 transition-transform duration-300">refresh</span>
                                    </div>
                                    <h3 className="text-base font-bold text-white uppercase tracking-wide group-hover:text-primary transition-colors">Nuevo Cliente</h3>
                                </button>
                                <button onClick={() => {
                                    setIsSidebarOpen(false);
                                    setNewClient({ name: '', phone: '', address: '', locationLink: '', coords: '' });
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
                                            onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Teléfono</label>
                                        <input
                                            type="tel"
                                            placeholder="Ej: 81 1234 5678"
                                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-500 transition-all font-mono"
                                            value={newClient.phone}
                                            onChange={(e) => setNewClient({ ...newClient, phone: e.target.value.replace(/\D/g, '') })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Dirección</label>
                                        <textarea
                                            placeholder="Calle, Número, Colonia..."
                                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-500 transition-all min-h-[80px]"
                                            value={newClient.address}
                                            onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                                        />
                                        <button 
                                            onClick={() => {
                                                if (!newClient.address) return showToast('Ingresa una dirección primero', 'info');
                                                const geocoder = new google.maps.Geocoder();
                                                geocoder.geocode({ address: newClient.address }, (results, status) => {
                                                    if (status === 'OK' && results && results[0]) {
                                                        const loc = results[0].geometry.location;
                                                        const lat = loc.lat();
                                                        const lng = loc.lng();
                                                        setNewClient({ ...newClient, coords: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
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
                                                        ...newClient, 
                                                        locationLink: link,
                                                        coords: coords
                                                    });
                                                    setDraftMarker({ lat, lng });
                                                    if (map) {
                                                        map.panTo({ lat, lng });
                                                        map.setZoom(17);
                                                    }
                                                } else {
                                                    setNewClient({ ...newClient, locationLink: link });
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
                                                        
                                                        setNewClient(prev => ({ ...prev, coords }));
                                                        setDraftMarker({ lat, lng });
                                                        
                                                        if (map) {
                                                            map.panTo({ lat, lng });
                                                            map.setZoom(17);
                                                        }
                                                        alert('Ubicación encontrada y centrada en el mapa.');
                                                    } else {
                                                        // Fallback for short links
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
                                                setNewClient({ ...newClient, coords: val });
                                                const parts = val.split(',').map(s => parseFloat(s.trim()));
                                                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                                                    setDraftMarker({ lat: parts[0], lng: parts[1] });
                                                }
                                            }}
                                        />
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

                                                // Push to Google Sheets (Non-blocking)
                                                pushToGoogleSheets('Matutina', {
                                                    name: newClient.name,
                                                    phone: newClient.phone,
                                                    address: newClient.address,
                                                    locationLink: newClient.locationLink,
                                                    coords: newClient.coords
                                                });

                                                showToast('Cliente guardado en RUTA MATUTINA');
                                                setNewClient({ name: '', phone: '', address: '', locationLink: '', coords: '' });
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

                                                // Push to Google Sheets (Non-blocking)
                                                pushToGoogleSheets('Vespertina', {
                                                    name: newClient.name,
                                                    phone: newClient.phone,
                                                    address: newClient.address,
                                                    locationLink: newClient.locationLink,
                                                    coords: newClient.coords
                                                });

                                                showToast('Cliente guardado en RUTA VESPERTINA');
                                                setNewClient({ name: '', phone: '', address: '', locationLink: '', coords: '' });
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
                        {/* End Sidebar */}

            </div>


            {/* Toast eliminado — ya no aparece al crear una carrera */}

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

            {/* Panel lateral de Despacho - Acoplado a la derecha */}
            <div className={`absolute top-0 bottom-0 right-0 z-[700] flex items-stretch transition-all duration-300 ${isDispatchOpen ? 'w-[400px]' : 'w-0'}`}>
                {/* Toggle Button */}
                <button
                    onClick={() => setIsDispatchOpen(!isDispatchOpen)}
                    className="absolute -left-10 top-1/2 -translate-y-1/2 z-40 w-10 h-24 bg-black/70 backdrop-blur-md border border-white/10 border-r-0 rounded-l-xl flex items-center justify-center text-white hover:bg-black/90 transition-all shadow-xl"
                    title={isDispatchOpen ? 'Ocultar Despacho' : 'Mostrar Despacho'}
                >
                    <div className="flex flex-col items-center gap-1">
                        <span className="material-symbols-outlined text-[18px]">{isDispatchOpen ? 'chevron_right' : 'chevron_left'}</span>
                        {!isDispatchOpen && <span className="text-[8px] font-bold uppercase tracking-wider writing-mode-vertical" style={{ writingMode: 'vertical-lr' }}>Despacho</span>}
                        {!isDispatchOpen && activeTrips.length > 0 && (
                            <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">{activeTrips.length}</span>
                        )}
                    </div>
                </button>

                {/* Panel Content */}
                <div className={`w-full h-full flex flex-col bg-[#0f0f1a]/95 backdrop-blur-2xl border-l border-white/[0.06] shadow-2xl overflow-hidden transition-all duration-300 ${isDispatchOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <div className="px-5 py-4 border-b border-white/[0.06] flex justify-between items-center bg-white/[0.02] shrink-0">
                        <div>
                            <h3 className="text-white text-[15px] font-bold leading-tight tracking-tight">
                                {selectedRoute === 'morning' ? '☀️ Ruta Matutina' : selectedRoute === 'evening' ? '🌙 Ruta Vespertina' : 'Monitor en Vivo'}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                </span>
                                <span className="text-gray-500 text-[11px] font-medium">
                                    {selectedRoute ? `${routeDrivers.length} Repartidores` : `Sistema En Línea • ${activeTrips.length} Activos`}
                                </span>
                            </div>
                        </div>
                        <button onClick={() => setIsDispatchOpen(false)} className="text-gray-500 hover:text-gray-300 p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 scrollbar-hide">
                        {/* Route Driver Cards or Driver Details */}
                        {selectedDriverForDetails ? (
                            <div className="flex flex-col gap-3 pb-6">
                                {/* Back button and Driver Summary Header */}
                                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 shrink-0">
                                    <button 
                                        onClick={() => setSelectedDriverForDetails(null)}
                                        className="flex items-center gap-1 text-gray-400 hover:text-white mb-3 transition-colors text-xs font-bold bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md w-fit cursor-pointer relative z-50"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                                        Volver a Repartidores
                                    </button>
                                    
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shadow-lg shrink-0"
                                                style={{ backgroundColor: `${selectedDriverForDetails?.colorHex || '#3B82F6'}30`, color: selectedDriverForDetails?.colorHex || '#3B82F6', border: `1px solid ${selectedDriverForDetails?.colorHex || '#3B82F6'}40` }}
                                            >
                                                {selectedDriverForDetails?.driverName ? selectedDriverForDetails.driverName.substring(0, 2) : 'DR'}
                                            </div>
                                            <div>
                                                <p className="text-white text-sm font-semibold tracking-tight">{selectedDriverForDetails?.driverName || 'Repartidor'}</p>
                                                <p className="text-gray-500 text-[10px] font-medium">{selectedDriverForDetails?.totalClients || 0} clientes asignados</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-gray-500 text-[10px] font-medium">
                                            {selectedDriverForDetails?.deliveredCount || 0} de {selectedDriverForDetails?.totalClients || 0} entregas
                                        </span>
                                        <span className="text-emerald-400 text-[10px] font-bold">
                                            {selectedDriverForDetails?.totalClients ? Math.round(((selectedDriverForDetails.deliveredCount || 0) / selectedDriverForDetails.totalClients) * 100) : 0}%
                                        </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500 ease-out"
                                            style={{
                                                width: `${selectedDriverForDetails?.totalClients ? ((selectedDriverForDetails.deliveredCount || 0) / selectedDriverForDetails.totalClients) * 100 : 0}%`,
                                                backgroundColor: selectedDriverForDetails?.colorHex || '#3B82F6',
                                            }}
                                        />
                                    </div>
                                </div>
                                
                                {/* Clients List */}
                                <div className="flex flex-col gap-2">
                                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider px-1 mb-1">
                                        {selectedDriverForDetails?.clients?.length || 0} CLIENTES EN RUTA
                                    </p>
                                    {(selectedDriverForDetails?.clients || []).map((client, cIdx) => (
                                        <div key={cIdx} className="bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] rounded-lg p-3 flex items-start gap-3 transition-colors">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${client.isDelivered ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-gray-700/50 text-gray-300 border border-gray-600/50'}`}>
                                                {client.order < 9999 ? client.order : cIdx + 1}
                                            </div>
                                            <div className="min-w-0 flex-1 flex flex-col justify-center min-h-[32px]">
                                                <p className={`text-sm font-bold truncate ${client.isDelivered ? 'text-gray-400 line-through' : 'text-gray-100'}`}>
                                                    {client.name || 'Cliente sin nombre'}
                                                </p>
                                                <p className="text-gray-500 text-[10px] truncate flex items-center gap-1 mt-0.5" title={client.address || 'Ubicación'}>
                                                    <span className="material-symbols-outlined text-[11px] text-red-400">location_on</span>
                                                    {client.address || 'Ubicación de entrega'}
                                                </p>
                                            </div>
                                            {client.isDelivered && (
                                                <span className="material-symbols-outlined text-emerald-400 text-[20px] shrink-0 self-center">check_circle</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : selectedRoute && routeDrivers.length > 0 ? (
                            routeDrivers.map((driver, idx) => {
                                const color = driver.colorHex || DRIVER_COLORS[idx % DRIVER_COLORS.length];
                                const pct = driver.totalClients > 0 ? Math.round((driver.deliveredCount / driver.totalClients) * 100) : 0;
                                const statusConfig = {
                                    en_curso: { label: 'En Curso', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-400' },
                                    finalizada: { label: 'Finalizada', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
                                    sin_iniciar: { label: 'Sin Iniciar', bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/20', dot: 'bg-gray-400' },
                                };
                                const sc = statusConfig[driver.status];

                                return (
                                    <div 
                                        key={driver.driverName} 
                                        onClick={() => setSelectedDriverForDetails(driver)}
                                        className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.08] hover:border-white/[0.1] transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md"
                                    >
                                        {/* Driver Header */}
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shadow-lg"
                                                    style={{ backgroundColor: `${color}30`, color: color, border: `1px solid ${color}40` }}
                                                >
                                                    {driver.driverName.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-semibold tracking-tight">{driver.driverName}</p>
                                                    <p className="text-gray-500 text-[10px] font-medium">{driver.totalClients} clientes asignados</p>
                                                </div>
                                            </div>
                                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${sc.bg} border ${sc.border}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}></div>
                                                <span className={`text-[10px] font-bold ${sc.text}`}>{sc.label}</span>
                                            </div>
                                        </div>

                                        {/* Current Client */}
                                        {driver.currentClient && (
                                            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-white/[0.03] rounded-lg border border-white/[0.04]">
                                                <span className="material-symbols-outlined text-[14px] text-blue-400">location_on</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-gray-500 text-[9px] font-semibold uppercase tracking-wider">Próximo cliente</p>
                                                    <p className="text-gray-200 text-xs font-medium truncate">{driver.currentClient}</p>
                                                </div>
                                            </div>
                                        )}
                                        {driver.status === 'finalizada' && (
                                            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-emerald-500/[0.06] rounded-lg border border-emerald-500/10">
                                                <span className="material-symbols-outlined text-[14px] text-emerald-400">check_circle</span>
                                                <p className="text-emerald-400 text-xs font-semibold">Todas las entregas completadas</p>
                                            </div>
                                        )}

                                        {/* Progress Bar */}
                                        <div className="mb-2">
                                            <div className="flex justify-between items-center mb-1.5">
                                                <span className="text-gray-500 text-[10px] font-medium">
                                                    {driver.deliveredCount} / {driver.totalClients} entregas
                                                </span>
                                                <span className="text-gray-400 text-[10px] font-bold">{pct}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500 ease-out"
                                                    style={{
                                                        width: `${pct}%`,
                                                        backgroundColor: pct >= 100 ? '#10B981' : color,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Last delivery time */}
                                        {driver.lastDeliveredAt && (
                                            <p className="text-gray-600 text-[9px] font-medium mt-1">
                                                Última entrega: {new Date(driver.lastDeliveredAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                );
                            })
                        ) : selectedRoute && loadingRoute ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-3">
                                <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin"></div>
                                <p className="text-gray-500 text-xs font-medium">Cargando repartidores...</p>
                            </div>
                        ) : selectedRoute && routeDrivers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-2">
                                <span className="material-symbols-outlined text-[32px] text-gray-600">person_off</span>
                                <p className="text-gray-500 text-xs font-medium">No hay repartidores activos en esta ruta</p>
                            </div>
                        ) : !selectedRoute && activeTrips.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-2">
                                <span className="material-symbols-outlined text-[32px] text-gray-600">local_shipping</span>
                                <p className="text-gray-500 text-xs font-medium text-center">Selecciona una ruta para ver<br/>los repartidores activos</p>
                            </div>
                        ) : (
                            [...activeTrips]
                                .sort((a, b) => {
                                    const timeA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : new Date(a.createdAt || 0).getTime();
                                    const timeB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : new Date(b.createdAt || 0).getTime();
                                    return timeA - timeB;
                                })
                                .map((trip, index) => {
                                    const TRIP_COLORS = [
                                        '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#e11d48', '#0891b2', '#ea580c', '#65a30d', '#db2777'
                                    ];
                                    const color = TRIP_COLORS[index % TRIP_COLORS.length];

                                    // Lógica de Tiempos (Retraso o Espera)
                                    const scheduledDate = trip.scheduledAt ? new Date(trip.scheduledAt) : null;
                                    const nowMs = currentTime.getTime();

                                    const delayMins = (() => {
                                        if (!scheduledDate) return 0;
                                        const diff = Math.floor((nowMs - scheduledDate.getTime()) / 60000);
                                        return diff > 0 ? diff : 0;
                                    })();

                                    const minsUntilScheduled = (() => {
                                        if (!scheduledDate) return 0;
                                        const diff = Math.floor((scheduledDate.getTime() - nowMs) / 60000);
                                        return diff > 0 ? diff : 0;
                                    })();

                                    const waitMins = (() => {
                                        if (trip.driverArrivedAt) {
                                            const arrived = new Date(trip.driverArrivedAt).getTime();
                                            if (scheduledDate) {
                                                // Scheduled trip: timer starts at MAX(scheduled_time, arrived_time)
                                                const startCounterAt = Math.max(scheduledDate.getTime(), arrived);
                                                if (nowMs < startCounterAt) return 0;
                                                return Math.floor((nowMs - startCounterAt) / 60000);
                                            } else {
                                                // Non-scheduled trip: timer starts when driver arrives
                                                if (nowMs < arrived) return 0;
                                                return Math.floor((nowMs - arrived) / 60000);
                                            }
                                        }
                                        return 0;
                                    })();
                                    const isGracePeriodOver = waitMins >= 21;

                                    // Hora programada formateada
                                    const scheduledTimeStr = scheduledDate
                                        ? scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : null;
                                    
                                    const scheduledDateStrRaw = scheduledDate 
                                        ? scheduledDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }).replace(',', '')
                                        : '';
                                    const scheduledDateStr = scheduledDateStrRaw.charAt(0).toUpperCase() + scheduledDateStrRaw.slice(1);

                                    return (
                                        <div
                                            key={trip.id || index}
                                            onClick={() => setSelectedMapTripId(selectedMapTripId === trip.id ? null : trip.id)}
                                            className={`border p-4 rounded-xl hover:bg-white/10 transition-colors group cursor-pointer ${
                                                selectedMapTripId === trip.id 
                                                ? 'bg-blue-900/30 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                                                : 'bg-white/5 border-white/10'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-start gap-2">
                                                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ring-1 ring-white/20 shrink-0" style={{ backgroundColor: `${color}33`, color: color }}>
                                                        {trip.passengerName ? trip.passengerName.substring(0, 2).toUpperCase() : 'US'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-white text-sm font-bold leading-tight truncate">{trip.passengerName || 'Cliente'}</p>
                                                        {scheduledTimeStr ? (
                                                            <p className="text-amber-400 text-[10px] font-bold flex items-center gap-0.5">
                                                                <span className="material-symbols-outlined text-[11px]">schedule</span>
                                                                {scheduledDateStr} {scheduledTimeStr}
                                                                {minsUntilScheduled > 0 && (
                                                                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 font-bold text-[10px] border border-amber-500/40">en {minsUntilScheduled}m</span>
                                                                )}
                                                            </p>
                                                        ) : (
                                                            <p className="text-gray-400 text-[10px]">{trip.time}</p>
                                                        )}
                                                        {trip.driver && trip.driver !== 'Unknown' && (
                                                            <p className="text-blue-300 text-[10px] font-medium flex items-center gap-0.5 truncate">
                                                                <span className="material-symbols-outlined text-[10px]">person</span>
                                                                {trip.driver}
                                                            </p>
                                                        )}
                                                        {trip.businessId && (
                                                            <p className="text-purple-300 text-[10px] font-medium flex items-center gap-0.5 truncate">
                                                                <span className="material-symbols-outlined text-[10px]">business</span>
                                                                {businesses.find(b => b.id === trip.businessId)?.name || 'Cliente'}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-500 uppercase tracking-wide border border-yellow-500/20 whitespace-nowrap">
                                                        {trip.status}
                                                    </span>

                                                {/* Contadores de Tiempo — MÁS GRANDES Y VISIBLES */}
                                                {waitMins > 0 && !trip.tripStartedAt ? (
                                                    <span className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 border animate-in zoom-in duration-300 ${isGracePeriodOver ? 'bg-red-600 text-white border-red-400 shadow-[0_0_12px_rgba(220,38,38,0.6)]' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'}`}>
                                                        <span className="material-symbols-outlined text-[16px]">{isGracePeriodOver ? 'alarm_on' : 'timer'}</span>
                                                        <span className="text-sm font-mono">{waitMins}m</span>
                                                    </span>
                                                ) : (delayMins >= 0 && minsUntilScheduled === 0 && scheduledDate) ? (
                                                    <span className="px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 bg-red-500/25 text-red-400 border border-red-500/40 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.4)]">
                                                        <span className="material-symbols-outlined text-[16px]">schedule</span>
                                                        <span className="text-sm font-mono">{delayMins}m</span>
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="space-y-2 relative pl-3 border-l ml-1.5 my-3" style={{ borderColor: `${color}40` }}>
                                            <div className="relative">
                                                <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full ring-4 ring-black" style={{ backgroundColor: color }}></div>
                                                <p className="text-gray-300 text-xs line-clamp-1" title={trip.origin || 'Sin origen'}>{trip.origin || 'Ubicación de origen pendiente'}</p>
                                            </div>
                                            {trip.stops && trip.stops.length > 0 && trip.stops.map((stop, idx) => (
                                                <div key={idx} className="relative">
                                                    <div className="absolute -left-[19px] top-0 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-white text-[8px] font-black ring-2 ring-black">{idx + 1}</div>
                                                    <p className="text-orange-300 text-xs line-clamp-1" title={stop.address}>{stop.address}</p>
                                                </div>
                                            ))}
                                            <div className="relative">
                                                <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full ring-4 ring-black" style={{ backgroundColor: color }}></div>
                                                <p className="text-gray-300 text-xs line-clamp-1" title={trip.destination || 'Sin destino'}>{trip.destination || 'Ubicación de destino pendiente'}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                                            <p className="text-white font-mono font-bold text-sm">
                                                {trip.cost > 0 ? `$${(trip.cost + (trip.tollCost || 0)).toFixed(2)}` : 'Por cotizar'}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                {/* Edit Button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const biz = businesses.find(b => b.id === trip.businessId);
                                                        const rate = biz?.waitRatePerMin || 0;
                                                        setEditWaitRate(rate);
                                                        setEditingTripId(trip.id);
                                                        setEditTripFields({ 
                                                            passengerName: trip.passengerName || '', 
                                                            driverId: trip.driverId || '', 
                                                            waitTimeMinutes: trip.waitTimeMinutes || 0, 
                                                            waitTimeCost: trip.waitTimeCost || 0, 
                                                            cost: trip.cost || 0,
                                                            scheduledAt: trip.scheduledAt ? new Date(new Date(trip.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
                                                        });
                                                    }}
                                                    className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                                    title="Editar Carrera"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">edit</span>
                                                </button>
                                                {trip.status !== 'Completado' && trip.status !== 'Cancelado' && (
                                                    <button
                                                        onClick={(e) => handleCopyClientLinkSidebar(trip, e)}
                                                        className={`text-xs px-2 py-1.5 rounded-lg transition-all flex items-center gap-1 ${copiedClientTripId === trip.id
                                                            ? 'bg-blue-500/20 text-blue-400'
                                                            : 'bg-white/10 hover:bg-white/20 text-white'
                                                            }`}
                                                        title="Copiar Link Cliente"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">
                                                            {copiedClientTripId === trip.id ? 'check' : 'link'}
                                                        </span>
                                                        {copiedClientTripId === trip.id ? '¡Copiado!' : 'Cliente'}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => handleCopyTrip(trip, e)}
                                                    className={`text-xs px-2 py-1.5 rounded-lg transition-all flex items-center gap-1 ${copiedTripId === trip.id
                                                        ? 'bg-green-500/20 text-green-400'
                                                        : 'bg-white/10 hover:bg-white/20 text-white'
                                                        }`}
                                                    title="Copiar despacho"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">
                                                        {copiedTripId === trip.id ? 'check' : 'content_copy'}
                                                    </span>
                                                    {copiedTripId === trip.id ? '¡Copiado!' : 'Repartidor'}
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); window.location.href = `#/tracking/${trip.id}`; }}
                                                    className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">map</span>
                                                    Mapa
                                                </button>
                                            </div>
                                        </div>

                                        {/* Inline Edit Panel */}
                                        {editingTripId === trip.id && (
                                            <div className="mt-3 rounded-xl overflow-hidden border border-indigo-500/40 shadow-lg">
                                                {/* Header */}
                                                <div className="px-3 py-2 bg-indigo-600/30 flex items-center gap-2 border-b border-indigo-500/30">
                                                    <span className="material-symbols-outlined text-indigo-300 text-[15px]">edit_note</span>
                                                    <p className="text-[11px] font-black text-indigo-200 uppercase tracking-widest">Editar Datos de Carrera</p>
                                                </div>
                                                {/* Body */}
                                                <div className="bg-[#1a1a2e] p-3 space-y-3">
                                                    {/* Cliente */}
                                                    <div>
                                                        <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">Nombre del Cliente</label>
                                                        <input
                                                            type="text"
                                                            className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder-white/30"
                                                            value={editTripFields.passengerName}
                                                            onChange={(e) => setEditTripFields(p => ({ ...p, passengerName: e.target.value }))}
                                                            placeholder="Nombre del cliente..."
                                                        />
                                                    </div>
                                                    {/* Fecha y Hora de Programación */}
                                                    <div>
                                                        <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">Programación de la Entrega (Opcional)</label>
                                                        <input
                                                            type="datetime-local"
                                                            className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                                            value={editTripFields.scheduledAt || ''}
                                                            onChange={(e) => setEditTripFields(p => ({ ...p, scheduledAt: e.target.value }))}
                                                        />
                                                    </div>
                                                    {/* Repartidor — dropdown por ID para re-asignación real */}
                                                    <div>
                                                        <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">Repartidor</label>
                                                        <select
                                                            className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-400 appearance-none cursor-pointer"
                                                            value={editTripFields.driverId}
                                                            onChange={(e) => setEditTripFields(p => ({ ...p, driverId: e.target.value }))}
                                                        >
                                                            <option value="" className="bg-[#1a1a2e] text-gray-400">— Sin asignar —</option>
                                                            {drivers.map(d => (
                                                                <option key={d.id} value={d.id} className="bg-[#1a1a2e] text-white">
                                                                    {d.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    {/* Espera + Costo Espera */}
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">Espera (min)</label>
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                                                value={editTripFields.waitTimeMinutes}
                                                                onChange={(e) => {
                                                                    const mins = parseFloat(e.target.value) || 0;
                                                                    const waitCost = calcWaitCost(mins, editWaitRate);
                                                                    const prevWait = editTripFields.waitTimeCost;
                                                                    const newCost = parseFloat((editTripFields.cost - prevWait + waitCost).toFixed(2));
                                                                    setEditTripFields(p => ({ ...p, waitTimeMinutes: mins, waitTimeCost: waitCost, cost: newCost }));
                                                                }}
                                                                min="0"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">
                                                                Costo Espera
                                                                {editWaitRate > 0 && <span className="ml-1 text-indigo-400/70 normal-case font-normal text-[9px]">(${editWaitRate}/min &gt;20min)</span>}
                                                            </label>
                                                            <div className="w-full bg-indigo-900/40 border border-indigo-500/40 rounded-lg px-3 py-2 text-sm text-indigo-200 font-bold font-mono flex items-center gap-1">
                                                                <span className="text-indigo-400">$</span>
                                                                {editTripFields.waitTimeCost.toFixed(2)}
                                                                {editWaitRate === 0 && <span className="text-white/30 font-normal text-[10px] ml-1">auto</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Costo total — solo lectura, no editable */}
                                                    <div>
                                                        <label className="text-[10px] font-extrabold text-indigo-300/80 uppercase tracking-widest block mb-1">Costo Total ($)</label>
                                                        <div className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-bold font-mono opacity-60 cursor-not-allowed select-none">
                                                            ${editTripFields.cost.toFixed(2)}
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Footer buttons */}
                                                <div className="flex gap-2 px-3 py-2.5 bg-black/30 border-t border-white/5">
                                                    <button
                                                        disabled={savingEdit}
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            setSavingEdit(true);
                                                            const ok = await updateTrip({
                                                                id: trip.id,
                                                                passengerName: editTripFields.passengerName,
                                                                // Re-assign to selected driver ID (handles change from old to new driver)
                                                                driverId: editTripFields.driverId || undefined,
                                                                waitTimeMinutes: editTripFields.waitTimeMinutes,
                                                                waitTimeCost: editTripFields.waitTimeCost,
                                                                cost: editTripFields.cost,
                                                                scheduledAt: editTripFields.scheduledAt ? new Date(editTripFields.scheduledAt).toISOString() : null as any
                                                            });
                                                            if (ok) {
                                                                const newDriverName = drivers.find(d => d.id === editTripFields.driverId)?.name || trip.driver;
                                                                const sAt = editTripFields.scheduledAt ? new Date(editTripFields.scheduledAt).toISOString() : (editTripFields.scheduledAt === '' ? undefined : trip.scheduledAt);
                                                                setActiveTrips(prev => prev.map(t => t.id === trip.id ? { ...t, passengerName: editTripFields.passengerName, driver: newDriverName, driverId: editTripFields.driverId || t.driverId, waitTimeMinutes: editTripFields.waitTimeMinutes, waitTimeCost: editTripFields.waitTimeCost, cost: editTripFields.cost, scheduledAt: sAt } : t));
                                                                setEditingTripId(null);
                                                            } else {
                                                                alert('Error al guardar cambios.');
                                                            }
                                                            setSavingEdit(false);
                                                        }}
                                                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">save</span>
                                                        {savingEdit ? 'Guardando...' : 'Guardar'}
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingTripId(null); }}
                                                        className="py-2 px-4 bg-white/10 hover:bg-white/20 text-white/70 text-xs font-bold rounded-lg transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Registro de Casetas */}
                                        {trip.status === 'En Progreso' && (
                                            <div className="mt-3 p-2 bg-indigo-500/5 rounded-lg border border-indigo-500/20 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                                                <label className="text-[10px] font-black text-indigo-400/70 uppercase tracking-widest flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[16px]">toll</span>
                                                    Casetas / Peajes
                                                </label>
                                                <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-md border border-white/5">
                                                    <span className="text-indigo-400/50 text-[10px] font-bold">$</span>
                                                    <input 
                                                        type="number"
                                                        className="w-16 bg-transparent border-none p-0 text-xs text-white focus:outline-none font-mono font-bold"
                                                        defaultValue={trip.tollCost || 0}
                                                        placeholder="0.00"
                                                        onBlur={async (e) => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            if (val !== trip.tollCost) {
                                                                const ok = await updateTrip({ id: trip.id, tollCost: val });
                                                                if (ok) {
                                                                    setActiveTrips(prev => prev.map(t => t.id === trip.id ? { ...t, tollCost: val } : t));
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* ─── BOTONES DE ACCIÓN ─────────────────────────────────────────
                                            Orden: Cancelar | Repartidor en Sitio | Iniciar Entrega | Finalizar Entrega
                                            Cada botón desaparece al presionarse.
                                        */}
                                        <div className="flex gap-2 mt-3 flex-wrap">
                                            {/* CANCELAR — siempre visible mientras no esté finalizado/cancelado */}
                                            {(trip.status !== 'Completado' && trip.status !== 'Cancelado') && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!confirm('¿Cancelar esta carrera?')) return;
                                                        const ok = await updateTripStatus(trip.id, 'Cancelado');
                                                        if (ok) setActiveTrips(prev => prev.filter(t => t.id !== trip.id));
                                                        else alert('Error al cancelar la carrera.');
                                                    }}
                                                    className="flex-1 min-w-[100px] py-2 rounded-lg bg-red-600/20 border border-red-500/30 text-red-500 hover:text-red-400 text-xs font-bold uppercase tracking-wider hover:bg-red-600/40 transition-all flex items-center justify-center gap-1.5"
                                                    title="Cancelar Carrera"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">cancel</span>
                                                    Cancelar
                                                </button>
                                            )}
                                            {/* REPARTIDOR EN SITIO — visible hasta que el repartidor llegue */}
                                            {((trip.status === 'Programado' || trip.status === 'En Progreso') && !trip.driverArrivedAt) && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const now = new Date().toISOString();
                                                        const update: any = { id: trip.id, driverArrivedAt: now };
                                                        if (trip.status === 'Programado') update.status = 'En Progreso';
                                                        const ok = await updateTrip(update);
                                                        if (ok) setActiveTrips(prev => prev.map(t => t.id === trip.id ? { ...t, driverArrivedAt: now, status: update.status || t.status } : t));
                                                    }}
                                                    className="flex-1 min-w-[100px] py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 hover:text-indigo-300 text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-600/40 transition-all flex items-center justify-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">airport_shuttle</span>
                                                    Repartidor en Sitio
                                                </button>
                                            )}
                                            {/* INICIAR ENTREGA — visible después de Repartidor en Sitio */}
                                            {((trip.status === 'Programado' || trip.status === 'En Progreso') && trip.driverArrivedAt && !trip.tripStartedAt) && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const startedAt = new Date();
                                                        const arrivedAt = new Date(trip.driverArrivedAt!);
                                                        const scheduledAt = new Date(trip.scheduledAt || trip.driverArrivedAt!);
                                                        const maxStart = new Date(Math.max(arrivedAt.getTime(), scheduledAt.getTime()));
                                                        let waitMins = Math.floor((startedAt.getTime() - maxStart.getTime()) / 60000);
                                                        if (waitMins < 0) waitMins = 0;
                                                        let waitCost = 0;
                                                        if (waitMins > 20 && trip.businessId) {
                                                            const business = businesses.find(b => b.id === trip.businessId);
                                                            if (business && business.waitRatePerMin) {
                                                                waitCost = (waitMins - 20) * business.waitRatePerMin;
                                                            }
                                                        }
                                                        const ok = await updateTrip({ id: trip.id, tripStartedAt: startedAt.toISOString(), status: 'En Progreso', waitTimeMinutes: waitMins, waitTimeCost: waitCost });
                                                        if (ok) {
                                                            setActiveTrips(prev => prev.map(t => t.id === trip.id ? { ...t, tripStartedAt: startedAt.toISOString(), status: 'En Progreso', waitTimeMinutes: waitMins, waitTimeCost: waitCost } : t));
                                                        }
                                                    }}
                                                    className="flex-1 min-w-[100px] py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 hover:text-cyan-300 text-[10px] font-bold uppercase tracking-wider hover:bg-cyan-600/40 transition-all flex items-center justify-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                                                    Iniciar Entrega
                                                </button>
                                            )}
                                            {/* FINALIZAR ENTREGA — visible solo cuando la entrega ya inició */}
                                            {(trip.status === 'En Progreso' && trip.tripStartedAt) && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const card = (e.currentTarget as HTMLElement).closest('.group');
                                                        const tollInput = card?.querySelector('input[type="number"]') as HTMLInputElement | null;
                                                        const currentTollCost = tollInput ? (parseFloat(tollInput.value) || 0) : (trip.tollCost || 0);
                                                        const ok = await updateTrip({ id: trip.id, status: 'Completado', tollCost: currentTollCost });
                                                        if (ok) {
                                                            setActiveTrips(prev => prev.filter(t => t.id !== trip.id));
                                                            setFinishedTrip({ ...trip, status: 'Completado', tollCost: currentTollCost });
                                                        } else {
                                                            showToast('Error al finalizar la carrera', 'error');
                                                        }
                                                    }}
                                                    className="flex-1 min-w-[100px] py-2 rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 hover:text-green-300 text-xs font-bold uppercase tracking-wider hover:bg-green-600/40 transition-all flex items-center justify-center gap-1.5"
                                                    title="Finalizar Carrera"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                    Finalizar Entrega
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>

            {
                finishedTrip && (
                    <PaymentTicket trip={finishedTrip} onClose={() => setFinishedTrip(null)} />
                )
            }

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300`}>
                    <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl shadow-2xl border backdrop-blur-md ${
                        toast.type === 'error' ? 'bg-red-500/90 border-red-400 text-white' : 
                        toast.type === 'info' ? 'bg-blue-500/90 border-blue-400 text-white' :
                        'bg-green-500/90 border-green-400 text-white'
                    }`}>
                        <span className="material-symbols-outlined text-[20px]">
                            {toast.type === 'error' ? 'error' : toast.type === 'info' ? 'info' : 'check_circle'}
                        </span>
                        <p className="text-sm font-bold tracking-tight">{toast.message}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FleetMonitor;
