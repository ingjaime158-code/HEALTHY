import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../services/supabaseClient';

const DEFAULT_CENTER: [number, number] = [25.6866, -100.3161]; // Monterrey

// Haversine fallback to calculate distance between two coordinates in kilometers
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

interface TrackingState {
    isDelivered: boolean;
    deliveredAt: string | null;
    driverName: string;
    clientName: string;
    lat: number | null;
    lng: number | null;
    heading: number;
    lastUpdated: string | null;
}

interface OSRMRouteInfo {
    distanceMeters: number;
    durationSeconds: number;
}

interface RouteStopPoint {
    order: number;
    name: string;
    lat: number;
    lng: number;
}

interface CachedOsrmLeg {
    coords: [number, number][]; // [lat, lng][]
    durationSeconds: number;
    distanceMeters: number;
}

function parseCsvStops(csvText: string): Map<number, RouteStopPoint> {
    const stops = new Map<number, RouteStopPoint>();
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const ch = csvText[i];
        const next = csvText[i + 1];
        if (inQuotes) {
            if (ch === '"' && next === '"') {
                currentField += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                currentField += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
                currentRow.push(currentField.trim());
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
                if (ch === '\r') i++;
            } else if (ch !== '\r') {
                currentField += ch;
            }
        }
    }
    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
    }

    const coordRegex = /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/;
    for (const row of rows) {
        if (row.length < 2) continue;
        const orderNum = parseInt(row[0], 10);
        if (isNaN(orderNum) || orderNum < 0) continue;

        let lat: number | null = null;
        let lng: number | null = null;

        // Check standard COORDENADAS column (index 5) first, then scan all columns
        const candidateCols = [row[5], ...row];
        for (const col of candidateCols) {
            if (!col) continue;
            const match = col.match(coordRegex);
            if (match) {
                const parsedLat = parseFloat(match[1]);
                const parsedLng = parseFloat(match[2]);
                if (!isNaN(parsedLat) && !isNaN(parsedLng) && Math.abs(parsedLat) <= 90 && Math.abs(parsedLng) <= 180) {
                    lat = parsedLat;
                    lng = parsedLng;
                    break;
                }
            }
        }

        if (lat !== null && lng !== null) {
            stops.set(orderNum, {
                order: orderNum,
                name: row[1] || `Parada ${orderNum}`,
                lat,
                lng,
            });
        }
    }

    return stops;
}

function interpolatePointAlongPolyline(
    coords: [number, number][],
    fraction: number
): [number, number] {
    if (coords.length === 0) return DEFAULT_CENTER;
    if (coords.length === 1 || fraction <= 0) return coords[0];
    if (fraction >= 1) return coords[coords.length - 1];

    const segLengths: number[] = [];
    let totalLen = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const d = getDistanceFromLatLonInKm(
            coords[i][0],
            coords[i][1],
            coords[i + 1][0],
            coords[i + 1][1]
        );
        segLengths.push(d);
        totalLen += d;
    }

    if (totalLen <= 0) return coords[0];
    const targetDist = totalLen * fraction;
    let accum = 0;

    for (let i = 0; i < segLengths.length; i++) {
        const seg = segLengths[i];
        if (accum + seg >= targetDist && seg > 0) {
            const localT = (targetDist - accum) / seg;
            return [
                coords[i][0] + (coords[i + 1][0] - coords[i][0]) * localT,
                coords[i][1] + (coords[i + 1][1] - coords[i][1]) * localT,
            ];
        }
        accum += seg;
    }

    return coords[coords.length - 1];
}

export const ClientLiveTracking: React.FC = () => {
    const [searchParams] = useSearchParams();
    const driverId = searchParams.get('driver') || '';
    const orderStr = searchParams.get('order') || '0';
    const clientOrder = parseInt(orderStr, 10);
    const routeType = searchParams.get('route') || 'evening';
    const clientNameParam = searchParams.get('name') || '';
    const destParam = searchParams.get('dest') || ''; // Format: "lat,lng"
    const dateParam = searchParams.get('date') || ''; // Format: "YYYY-MM-DD"

    // Parse destination coordinates if available
    const destCoords = useMemo<[number, number] | null>(() => {
        if (!destParam) return null;
        const parts = destParam.split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return [parts[0], parts[1]];
        }
        return null;
    }, [destParam]);

    // Fecha operativa de la entrega (por defecto hoy en zona horaria Monterrey/CDMX)
    const today = useMemo(() => {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    }, []);

    const effectiveDate = useMemo(() => {
        if (dateParam && dateParam.trim()) return dateParam.trim();
        return today;
    }, [dateParam, today]);

    // Clave persistente en localStorage aislada por fecha para evitar falsos positivos de entregas de días previos
    const terminalStorageKey = useMemo(() => {
        if (!driverId) return '';
        const cleanName = (clientNameParam || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return `hd_tracking_latch_${driverId}_${clientOrder}_${routeType}_${effectiveDate}${cleanName ? `_${cleanName}` : ''}`;
    }, [driverId, clientOrder, routeType, effectiveDate, clientNameParam]);

    // Verificar si ya fue finalizado previamente en este dispositivo para la fecha actual
    const initialTerminalState = useMemo<TrackingState | null>(() => {
        if (!terminalStorageKey) return null;
        try {
            const raw = localStorage.getItem(terminalStorageKey);
            if (raw) {
                const saved = JSON.parse(raw);
                // Si el registro guardado pertenece a una fecha distinta, descartarlo
                if (saved.deliveryDate && saved.deliveryDate !== effectiveDate) {
                    return null;
                }
                const savedTime = new Date(saved.deliveredAt || saved.savedAt || 0).getTime();
                // Mantener el candado activo durante las 18 horas posteriores a la entrega de ese día
                if (Date.now() - savedTime < 18 * 60 * 60 * 1000) {
                    return {
                        isDelivered: true,
                        deliveredAt: saved.deliveredAt || new Date().toISOString(),
                        driverName: saved.driverName || 'Repartidor Healthy Dream',
                        clientName: saved.clientName || clientNameParam || 'Cliente',
                        lat: null,
                        lng: null,
                        heading: 0,
                        lastUpdated: saved.deliveredAt || new Date().toISOString(),
                    };
                }
            }
        } catch {}
        return null;
    }, [terminalStorageKey, effectiveDate, clientNameParam]);

    const [tracking, setTracking] = useState<TrackingState | null>(() => initialTerminalState);
    const [loading, setLoading] = useState<boolean>(() => !initialTerminalState);
    const [lastUpdatedSecs, setLastUpdatedSecs] = useState<number>(0);
    const [osrmInfo, setOsrmInfo] = useState<OSRMRouteInfo | null>(null);

    // Candado estricto irreversible: si se marca delivered, NINGÚN evento o reinicio de ruta puede reactivarlo
    const isDeliveredRef = useRef<boolean>(Boolean(initialTerminalState?.isDelivered));
    const realtimeChannelRef = useRef<any>(null);
    const pollIntervalRef = useRef<any>(null);
    const secIntervalRef = useRef<any>(null);

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const driverMarkerRef = useRef<L.Marker | null>(null);
    const destMarkerRef = useRef<L.Marker | null>(null);
    const routeOutlineLayerRef = useRef<L.Polyline | null>(null);
    const routeMainLayerRef = useRef<L.Polyline | null>(null);
    const routeDashedLayerRef = useRef<L.Polyline | null>(null);
    const hasInitialFittedRef = useRef(false);
    const routeStopsCacheRef = useRef<Map<number, RouteStopPoint> | null>(null);
    const osrmLegCacheRef = useRef<Map<string, CachedOsrmLeg>>(new Map());

    const loadDriverRouteStops = useCallback(async (): Promise<Map<number, RouteStopPoint>> => {
        if (routeStopsCacheRef.current && routeStopsCacheRef.current.size > 0) {
            return routeStopsCacheRef.current;
        }
        const empty = new Map<number, RouteStopPoint>();
        if (!driverId) return empty;

        try {
            const { data: profileData } = await supabase.rpc('driver_get_profile', {
                p_driver_id: driverId,
            });
            const profile = Array.isArray(profileData) ? profileData[0] : profileData;
            if (!profile) return empty;

            const isMorning = routeType.toLowerCase().startsWith('m');
            const sheetUrl: string =
                (isMorning ? profile.morning_sheet_url : profile.evening_sheet_url) ||
                profile.morning_sheet_url ||
                profile.evening_sheet_url ||
                '';

            const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (!sheetIdMatch) return empty;
            const sheetId = sheetIdMatch[1];
            const gidMatch = sheetUrl.match(/gid=(\d+)/);
            const gid = gidMatch ? gidMatch[1] : '0';

            const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}&tcb=${Math.floor(Date.now() / 60000)}`;
            const res = await fetch(csvUrl);
            if (!res.ok) return empty;
            const csvText = await res.text();
            const parsed = parseCsvStops(csvText);
            if (parsed.size > 0) {
                routeStopsCacheRef.current = parsed;
            }
            return parsed;
        } catch (e) {
            console.warn('[ClientLiveTracking] No se pudo cargar hoja de paradas para fallback:', e);
            return empty;
        }
    }, [driverId, routeType]);

    const getCachedOsrmLeg = useCallback(async (from: [number, number], to: [number, number]): Promise<CachedOsrmLeg | null> => {
        const key = `${from[0].toFixed(5)},${from[1].toFixed(5)}->${to[0].toFixed(5)},${to[1].toFixed(5)}`;
        const cached = osrmLegCacheRef.current.get(key);
        if (cached) return cached;

        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const r = data.routes[0];
                const coords: [number, number][] = r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
                const leg: CachedOsrmLeg = {
                    coords,
                    durationSeconds: Number(r.duration) || 300,
                    distanceMeters: Number(r.distance) || 1000,
                };
                osrmLegCacheRef.current.set(key, leg);
                return leg;
            }
        } catch {}
        return null;
    }, []);

    /**
     * Cuando Android suspende el GPS en segundo plano al abrir Waze/Google Maps y `driver_locations`
     * queda congelado en el local, reconstruye la ubicación real del repartidor a partir de su última
     * entrega confirmada hoy (`delivery_logs`) y avanza sobre la ruta vial OSRM hacia la siguiente parada.
     */
    const resolveStaleGpsPosition = useCallback(async (
        rawLat: number | null,
        rawLng: number | null,
        lastUpdatedIso: string | null
    ): Promise<{ lat: number | null; lng: number | null }> => {
        const gpsTimeMs = lastUpdatedIso ? new Date(lastUpdatedIso).getTime() : 0;
        const gpsAgeMs = gpsTimeMs > 0 ? Math.max(0, Date.now() - gpsTimeMs) : Infinity;

        // Si el GPS reportó hace menos de 2 minutos, usar la coordenada GPS directa sin tocar nada
        if (rawLat && rawLng && gpsAgeMs <= 120_000) {
            return { lat: Number(rawLat), lng: Number(rawLng) };
        }

        const stopsMap = await loadDriverRouteStops();
        const stopKeys: number[] = Array.from(stopsMap.keys());
        const maxSheetOrder = stopKeys.length > 0
            ? Math.max(...stopKeys.filter((k: number) => k > 0), clientOrder)
            : Math.max(clientOrder, 15);

        const maxOrderToScan = Math.min(Math.max(maxSheetOrder, 1), 35);
        const ordersToCheck: number[] = [];
        for (let o = 1; o <= maxOrderToScan; o++) {
            ordersToCheck.push(o);
        }

        const statusResults = await Promise.all(
            ordersToCheck.map(async (ord) => {
                try {
                    const { data } = await supabase.rpc('get_public_delivery_tracking', {
                        p_driver_id: driverId,
                        p_client_order: ord,
                        p_route_type: routeType,
                        p_delivery_date: effectiveDate,
                    });
                    const r = Array.isArray(data) ? data[0] : null;
                    return {
                        order: ord,
                        isDelivered: Boolean(r?.is_delivered),
                        deliveredAt: (r?.delivered_at as string | null) || null,
                    };
                } catch {
                    return { order: ord, isDelivered: false, deliveredAt: null };
                }
            })
        );

        const deliveredStops = statusResults.filter(s => s.isDelivered);
        deliveredStops.sort((a, b) => {
            const tA = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
            const tB = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
            if (tB !== tA) return tB - tA;
            return b.order - a.order;
        });

        const latestDelivered = deliveredStops[0] || null;
        const latestDeliveredMs = latestDelivered?.deliveredAt
            ? new Date(latestDelivered.deliveredAt).getTime()
            : 0;

        // Determinar punto de partida confirmado (última entrega de hoy o local si aún va hacia el cliente #1)
        let anchorCoords: [number, number] | null = null;
        let anchorTimeMs = gpsTimeMs;

        if (latestDelivered && (latestDeliveredMs > gpsTimeMs || gpsAgeMs > 120_000)) {
            const stopInfo = stopsMap.get(latestDelivered.order);
            if (stopInfo) {
                anchorCoords = [stopInfo.lat, stopInfo.lng];
                anchorTimeMs = latestDeliveredMs || Date.now();
            }
        }

        if (!anchorCoords) {
            const baseStop = stopsMap.get(0);
            if (rawLat && rawLng) {
                anchorCoords = [Number(rawLat), Number(rawLng)];
            } else if (baseStop) {
                anchorCoords = [baseStop.lat, baseStop.lng];
            }
        }

        if (!anchorCoords) {
            return { lat: rawLat ? Number(rawLat) : null, lng: rawLng ? Number(rawLng) : null };
        }

        // Determinar cuál es la siguiente parada activa a la que se dirige el repartidor
        const highestDeliveredOrder = latestDelivered ? latestDelivered.order : 0;
        const nextPendingStatus = statusResults.find(
            s => !s.isDelivered && s.order > highestDeliveredOrder
        ) || statusResults.find(s => !s.isDelivered);

        let targetCoords: [number, number] | null = null;
        if (nextPendingStatus) {
            const nextStopInfo = stopsMap.get(nextPendingStatus.order);
            if (nextStopInfo) {
                targetCoords = [nextStopInfo.lat, nextStopInfo.lng];
            } else if (nextPendingStatus.order === clientOrder && destCoords) {
                targetCoords = destCoords;
            }
        } else if (destCoords) {
            targetCoords = destCoords;
        }

        if (!targetCoords) {
            return { lat: anchorCoords[0], lng: anchorCoords[1] };
        }

        const elapsedSec = anchorTimeMs > 0 ? Math.max(0, (Date.now() - anchorTimeMs) / 1000) : 0;
        const leg = await getCachedOsrmLeg(anchorCoords, targetCoords);

        if (leg && leg.coords.length > 1) {
            const travelReadySec = Math.max(0, elapsedSec - 25);
            const expectedDuration = Math.max(150, leg.durationSeconds);
            const fraction = Math.min(0.88, Math.max(0, travelReadySec / expectedDuration));
            const [interpLat, interpLng] = interpolatePointAlongPolyline(leg.coords, fraction);
            return { lat: interpLat, lng: interpLng };
        }

        // Fallback lineal si OSRM no responde
        const fallbackFraction = Math.min(0.85, Math.max(0, (elapsedSec - 25) / 480));
        return {
            lat: anchorCoords[0] + (targetCoords[0] - anchorCoords[0]) * fallbackFraction,
            lng: anchorCoords[1] + (targetCoords[1] - anchorCoords[1]) * fallbackFraction,
        };
    }, [driverId, routeType, effectiveDate, clientOrder, destCoords, loadDriverRouteStops, getCachedOsrmLeg]);

    // Cierre permanente e irrevocable de la sesión de rastreo al finalizar entrega
    const lockPermanentlyAsDelivered = useCallback((payload: {
        deliveredAt: string | null;
        driverName: string;
        clientName: string;
    }) => {
        isDeliveredRef.current = true;

        // 1. Guardar en almacenamiento local para inmunidad ante recargas de página
        if (terminalStorageKey) {
            try {
                localStorage.setItem(terminalStorageKey, JSON.stringify({
                    deliveredAt: payload.deliveredAt || new Date().toISOString(),
                    driverName: payload.driverName,
                    clientName: payload.clientName,
                    deliveryDate: effectiveDate,
                    savedAt: new Date().toISOString(),
                }));
            } catch {}
        }

        // 2. Destruir canal en tiempo real inmediatamente
        if (realtimeChannelRef.current) {
            try {
                supabase.removeChannel(realtimeChannelRef.current);
            } catch {}
            realtimeChannelRef.current = null;
        }

        // 3. Detener polling
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }

        // 4. Desmontar mapa Leaflet
        if (mapInstanceRef.current) {
            try {
                mapInstanceRef.current.remove();
            } catch {}
            mapInstanceRef.current = null;
        }

        // 5. Fijar estado en entregado
        setTracking({
            isDelivered: true,
            deliveredAt: payload.deliveredAt || new Date().toISOString(),
            driverName: payload.driverName || 'Repartidor Healthy Dream',
            clientName: payload.clientName || clientNameParam || 'Cliente',
            lat: null,
            lng: null,
            heading: 0,
            lastUpdated: payload.deliveredAt || new Date().toISOString(),
        });
        setLoading(false);
    }, [terminalStorageKey, effectiveDate, clientNameParam]);

    // Fetch tracking status from Supabase
    const fetchTracking = useCallback(async () => {
        if (isDeliveredRef.current) return;

        if (!driverId) {
            setLoading(false);
            return;
        }

        // Si el enlace incluye una fecha explícita (date), validar ÚNICAMENTE esa fecha para evitar
        // falsos positivos donde una entrega de ayer bloquee el reparto de hoy.
        const currentHour = new Date().getHours();
        const isLateNightCrossover = !dateParam && currentHour < 4;
        const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yesterday = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

        const datesToTry = dateParam && dateParam.trim()
            ? [dateParam.trim()]
            : (isLateNightCrossover ? [today, yesterday] : [today]);

        try {
            for (const testDate of datesToTry) {
                if (isDeliveredRef.current) return;

                const { data, error } = await supabase.rpc('get_public_delivery_tracking', {
                    p_driver_id: driverId,
                    p_client_order: clientOrder,
                    p_route_type: routeType,
                    p_delivery_date: testDate,
                });

                if (!error && Array.isArray(data) && data.length > 0) {
                    const row = data[0];
                    if (row.is_delivered) {
                        lockPermanentlyAsDelivered({
                            deliveredAt: row.delivered_at,
                            driverName: row.driver_name || 'Repartidor Healthy Dream',
                            clientName: row.client_name || clientNameParam || 'Cliente',
                        });
                        return;
                    }
                }
            }

            if (isDeliveredRef.current) return;

            // Si no fue entregado en la fecha correspondiente, obtener ubicación del chofer activa
            const { data: firstCheck } = await supabase.rpc('get_public_delivery_tracking', {
                p_driver_id: driverId,
                p_client_order: clientOrder,
                p_route_type: routeType,
                p_delivery_date: effectiveDate,
            });

            if (isDeliveredRef.current) return;

            if (Array.isArray(firstCheck) && firstCheck.length > 0) {
                const row = firstCheck[0];
                if (row.is_delivered) {
                    lockPermanentlyAsDelivered({
                        deliveredAt: row.delivered_at,
                        driverName: row.driver_name || 'Repartidor Healthy Dream',
                        clientName: row.client_name || clientNameParam || 'Cliente',
                    });
                    return;
                }

                const resolved = await resolveStaleGpsPosition(
                    row.lat ? Number(row.lat) : null,
                    row.lng ? Number(row.lng) : null,
                    row.last_updated || null
                );

                if (isDeliveredRef.current) return;

                setTracking({
                    isDelivered: false,
                    deliveredAt: null,
                    driverName: row.driver_name || 'Repartidor Healthy Dream',
                    clientName: row.client_name || clientNameParam || 'Cliente',
                    lat: resolved.lat,
                    lng: resolved.lng,
                    heading: Number(row.heading) || 0,
                    lastUpdated: row.last_updated,
                });
                setLoading(false);
                return;
            }

            // Fallback directo a ubicación
            const { data: locData } = await supabase
                .from('driver_locations')
                .select('lat, lng, heading, updated_at')
                .eq('driver_id', driverId)
                .maybeSingle();

            if (isDeliveredRef.current) return;

            const fallbackResolved = await resolveStaleGpsPosition(
                locData ? Number(locData.lat) : null,
                locData ? Number(locData.lng) : null,
                locData ? locData.updated_at : null
            );

            if (isDeliveredRef.current) return;

            setTracking({
                isDelivered: false,
                deliveredAt: null,
                driverName: 'Repartidor Healthy Dream',
                clientName: clientNameParam || 'Cliente',
                lat: fallbackResolved.lat,
                lng: fallbackResolved.lng,
                heading: locData ? Number(locData.heading) || 0 : 0,
                lastUpdated: locData ? locData.updated_at : null,
            });
        } catch (err) {
            console.warn('[ClientLiveTracking] Error cargando tracking:', err);
        } finally {
            setLoading(false);
        }
    }, [driverId, clientOrder, routeType, dateParam, clientNameParam, effectiveDate, today, lockPermanentlyAsDelivered, resolveStaleGpsPosition]);

    // Cargar inicial y escuchar canal Realtime
    useEffect(() => {
        if (isDeliveredRef.current) {
            setLoading(false);
            return;
        }

        fetchTracking();

        if (!driverId) return;

        // Suscribirse a ubicación en tiempo real vía Broadcast
        const channel = supabase.channel(`gps:${driverId}`);
        realtimeChannelRef.current = channel;

        channel
            .on('broadcast', { event: 'location' }, (payload: any) => {
                // Si la entrega ya terminó, IGNORAR cualquier paquete de ubicación nuevo del chofer
                if (isDeliveredRef.current) return;

                const data = payload?.payload;
                if (data && data.lat && data.lng) {
                    setTracking(prev => {
                        if (!prev || prev.isDelivered || isDeliveredRef.current) return prev;
                        return {
                            ...prev,
                            lat: data.lat,
                            lng: data.lng,
                            heading: data.heading || 0,
                            lastUpdated: new Date().toISOString(),
                        };
                    });
                    setLastUpdatedSecs(0);
                }
            })
            .subscribe();

        // Polling de respaldo cada 5 segundos
        pollIntervalRef.current = setInterval(() => {
            if (!isDeliveredRef.current) {
                fetchTracking();
            }
        }, 5000);

        // Contador de segundos desde última actualización
        secIntervalRef.current = setInterval(() => {
            setLastUpdatedSecs(s => s + 1);
        }, 1000);

        return () => {
            if (realtimeChannelRef.current) {
                try {
                    supabase.removeChannel(realtimeChannelRef.current);
                } catch {}
                realtimeChannelRef.current = null;
            }
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
            if (secIntervalRef.current) {
                clearInterval(secIntervalRef.current);
                secIntervalRef.current = null;
            }
        };
    }, [driverId, fetchTracking]);

    // Consultar y dibujar la ruta vial estilo Uber/Rappi (OSRM Turn-by-Turn)
    const updateRouteGeometry = useCallback(async (driverCoords: [number, number], destinationCoords: [number, number], mapParam?: L.Map) => {
        const map = mapParam || mapInstanceRef.current;
        if (!map) return;

        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${driverCoords[1]},${driverCoords[0]};${destinationCoords[1]},${destinationCoords[0]}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('OSRM status: ' + res.status);
            const data = await res.json();

            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const latLngs: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);

                setOsrmInfo({
                    distanceMeters: route.distance,
                    durationSeconds: route.duration,
                });

                // Si ya existen las capas de ruta, actualizarlas
                if (routeOutlineLayerRef.current && routeMainLayerRef.current && routeDashedLayerRef.current) {
                    routeOutlineLayerRef.current.setLatLngs(latLngs);
                    routeMainLayerRef.current.setLatLngs(latLngs);
                    routeDashedLayerRef.current.setLatLngs(latLngs);
                } else {
                    // 1. Capa de sombra / resplandor exterior
                    const outline = L.polyline(latLngs, {
                        color: '#064e3b',
                        weight: 8,
                        opacity: 0.6,
                        lineCap: 'round',
                        lineJoin: 'round',
                    }).addTo(map);

                    // 2. Línea principal verde esmeralda (estilo Uber/Rappi)
                    const mainLine = L.polyline(latLngs, {
                        color: '#10b981',
                        weight: 5,
                        opacity: 0.95,
                        lineCap: 'round',
                        lineJoin: 'round',
                    }).addTo(map);

                    // 3. Línea interior discontinua que resalta la dirección
                    const dashed = L.polyline(latLngs, {
                        color: '#ffffff',
                        weight: 2,
                        dashArray: '6, 12',
                        opacity: 0.85,
                        lineCap: 'round',
                        lineJoin: 'round',
                    }).addTo(map);

                    routeOutlineLayerRef.current = outline;
                    routeMainLayerRef.current = mainLine;
                    routeDashedLayerRef.current = dashed;
                }

                // Ajustar zoom inicial para abarcar ambos puntos cómodamente
                if (!hasInitialFittedRef.current) {
                    const bounds = L.latLngBounds(latLngs);
                    map.fitBounds(bounds, { padding: [100, 80], maxZoom: 16 });
                    hasInitialFittedRef.current = true;
                }
                return;
            }
        } catch (err) {
            console.warn('[ClientLiveTracking] Error cargando ruta OSRM:', err);
        }

        // Fallback: Línea recta directa si OSRM no responde
        const straightLine: [number, number][] = [driverCoords, destinationCoords];
        if (routeMainLayerRef.current) {
            routeMainLayerRef.current.setLatLngs(straightLine);
        } else {
            const mainLine = L.polyline(straightLine, {
                color: '#10b981',
                weight: 4,
                dashArray: '8, 8',
                opacity: 0.9,
            }).addTo(map);
            routeMainLayerRef.current = mainLine;
        }
    }, []);

    // Calcular ETA y distancia
    const etaInfo = useMemo(() => {
        if (!tracking?.lat || !tracking?.lng) {
            return {
                title: 'Tiempo estimado de llegada',
                timeText: 'Localizando...',
                subtitle: 'Conectando con el GPS del repartidor',
                isNear: false
            };
        }

        if (destCoords) {
            // Usar cálculo preciso de ruta OSRM si está disponible
            if (osrmInfo) {
                const distKm = osrmInfo.distanceMeters / 1000;
                const minutes = Math.max(1, Math.round(osrmInfo.durationSeconds / 60));

                if (distKm <= 0.35 || minutes <= 2) {
                    return {
                        title: '¡El repartidor está llegando!',
                        timeText: 'Menos de 2 min',
                        subtitle: 'Tu repartidor está a unos metros de tu domicilio',
                        isNear: true
                    };
                }

                const distDisplay = distKm < 1 ? `${Math.round(osrmInfo.distanceMeters)} metros` : `${distKm.toFixed(1)} km`;
                return {
                    title: 'Tiempo estimado de llegada',
                    timeText: `~${minutes} minutos`,
                    subtitle: `Aproximadamente a ${distDisplay} de tu domicilio`,
                    isNear: false
                };
            }

            // Fallback geométrico (Haversine)
            const distKm = getDistanceFromLatLonInKm(tracking.lat, tracking.lng, destCoords[0], destCoords[1]);
            if (distKm <= 0.35) {
                return {
                    title: '¡El repartidor está llegando!',
                    timeText: 'Menos de 2 min',
                    subtitle: 'Tu repartidor está a unos metros de tu domicilio',
                    isNear: true
                };
            }

            const minutes = Math.max(2, Math.round((distKm / 26) * 60) + 1);
            const distDisplay = distKm < 1 ? `${Math.round(distKm * 1000)} metros` : `${distKm.toFixed(1)} km`;

            return {
                title: 'Tiempo estimado de llegada',
                timeText: `~${minutes} minutos`,
                subtitle: `Aproximadamente a ${distDisplay} de tu domicilio`,
                isNear: false
            };
        }

        // Si no se pasaron coordenadas del cliente en la URL
        return {
            title: 'Tiempo estimado de llegada',
            timeText: 'En camino',
            subtitle: 'Tu repartidor está en ruta activa hacia tu entrega',
            isNear: false
        };
    }, [tracking?.lat, tracking?.lng, destCoords, osrmInfo]);

    // Inicializar y actualizar Leaflet Map con OpenStreetMap 100% libre de claves
    useEffect(() => {
        if (!tracking || tracking.isDelivered || !tracking.lat || !tracking.lng) {
            return;
        }

        const driverCoords: [number, number] = [tracking.lat, tracking.lng];

        if (!mapInstanceRef.current && mapContainerRef.current) {
            // Inicializar mapa
            const map = L.map(mapContainerRef.current, {
                center: driverCoords,
                zoom: 16,
                zoomControl: false,
            });

            // Capa 100% gratuita y oficial de OpenStreetMap (NUNCA requiere API key ni tiene marcas de agua)
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
                subdomains: ['a', 'b', 'c'],
            }).addTo(map);

            // Control de zoom discreto en la parte superior derecha
            L.control.zoom({ position: 'topright' }).addTo(map);

            // 1. Icono del repartidor: AUTO 🚗 con etiqueta de nombre
            const carIcon = L.divIcon({
                className: 'custom-driver-pin',
                html: `
                    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -100%);pointer-events:none;">
                        <div style="background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);border:1px solid #10b981;color:#ffffff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.4);margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                            <span>🚗</span><span>${tracking.driverName}</span>
                        </div>
                        <div style="width:44px;height:44px;background:#10b981;border:3px solid #ffffff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(16,185,129,0.55);font-size:22px;">
                            🚗
                        </div>
                    </div>
                `,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
            });

            const marker = L.marker(driverCoords, { icon: carIcon }).addTo(map);
            driverMarkerRef.current = marker;

            // 2. Icono del cliente: CASA 🏡 (Estilo Rappi / DiDi / Uber)
            if (destCoords) {
                const houseIcon = L.divIcon({
                    className: 'custom-dest-pin',
                    html: `
                        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -100%);pointer-events:none;">
                            <div style="background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);border:1.5px solid #3b82f6;color:#ffffff;font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.5);margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                                <span>🏡</span><span>Tu Domicilio</span>
                            </div>
                            <div style="width:44px;height:44px;background:#3b82f6;border:3px solid #ffffff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(59,130,246,0.6);font-size:22px;">
                                🏠
                            </div>
                        </div>
                    `,
                    iconSize: [0, 0],
                    iconAnchor: [0, 0],
                });

                const dMarker = L.marker(destCoords, { icon: houseIcon }).addTo(map);
                destMarkerRef.current = dMarker;

                mapInstanceRef.current = map;
                // Trazar la ruta vial turn-by-turn estilo Rappi/Uber
                updateRouteGeometry(driverCoords, destCoords, map);
            }

            mapInstanceRef.current = map;
        } else if (mapInstanceRef.current && driverMarkerRef.current) {
            // Actualizar posición del auto suavemente
            driverMarkerRef.current.setLatLng(driverCoords);

            // Si hay destino, actualizar la ruta vial
            if (destCoords) {
                updateRouteGeometry(driverCoords, destCoords);
            } else {
                mapInstanceRef.current.panTo(driverCoords, { animate: true, duration: 1 });
            }
        }
    }, [tracking?.lat, tracking?.lng, tracking?.driverName, tracking?.isDelivered, destCoords, updateRouteGeometry]);

    // Limpieza al desmontar
    useEffect(() => {
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0F1D] flex flex-col items-center justify-center p-6 text-white text-center">
                <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
                <h2 className="text-xl font-bold">Localizando entrega...</h2>
                <p className="text-gray-400 text-sm mt-1">Conectando con el GPS de tu repartidor</p>
            </div>
        );
    }

    if (!driverId || !tracking) {
        return (
            <div className="min-h-screen bg-[#0A0F1D] flex flex-col items-center justify-center p-6 text-white text-center">
                <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mb-4 text-3xl">
                    ⚠️
                </div>
                <h2 className="text-xl font-bold">Enlace no válido</h2>
                <p className="text-gray-400 text-sm mt-1 max-w-sm">
                    No se encontró la información de este pedido. Por favor verifica el enlace recibido en tu WhatsApp.
                </p>
            </div>
        );
    }

    // ─── PANTALLA: ENTREGA COMPLETADA (La conexión GPS se corta) ────────────────
    if (tracking.isDelivered) {
        const deliveredTimeStr = tracking.deliveredAt
            ? new Date(tracking.deliveredAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : '';

        return (
            <div className="min-h-screen bg-gradient-to-b from-[#0A1A14] to-[#0A0F1D] flex flex-col items-center justify-center p-6 text-white text-center">
                <div className="bg-[#10221A] border border-emerald-500/30 p-8 rounded-3xl max-w-md w-full shadow-[0_10px_40px_rgba(16,185,129,0.15)] flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
                    <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-4xl mb-4 border border-emerald-500/40 shadow-inner">
                        ✅
                    </div>
                    <span className="bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3 border border-emerald-500/20">
                        Entrega Finalizada
                    </span>
                    <h1 className="text-2xl font-black text-white mb-2">¡Tu pedido ha sido entregado!</h1>
                    <p className="text-emerald-200/90 text-sm mb-4">
                        Tu paquete Healthy Dream fue entregado con éxito
                        {deliveredTimeStr ? ` a las ${deliveredTimeStr}` : ''}.
                    </p>

                    <div className="w-full bg-white/[0.04] rounded-2xl p-4 border border-white/10 text-left mb-6 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-400">Repartidor:</span>
                            <span className="text-white font-semibold">{tracking.driverName}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-400">Estado de conexión GPS:</span>
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Conexión cerrada
                            </span>
                        </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/10 w-full flex items-center justify-center gap-2 text-xs text-emerald-400 font-bold">
                        <span>🍏 Healthy Dream</span>
                        <span className="text-gray-600">•</span>
                        <span>¡Buen provecho!</span>
                    </div>
                </div>
            </div>
        );
    }

    // ─── PANTALLA: REPARTIDOR EN CAMINO (Mapa Oficial OpenStreetMap con Ruta OSRM) ────
    return (
        <div className="relative h-screen w-screen bg-[#0A0F1D] flex flex-col text-white overflow-hidden">
            {/* Header Flotante */}
            <header className="absolute top-4 left-4 right-4 z-[1000] bg-[#0F172A]/90 backdrop-blur-md border border-white/10 rounded-2xl p-3.5 shadow-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-2xl">
                        🚗
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-bold text-white">Tu repartidor va en camino</h2>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        </div>
                        <p className="text-[11px] text-gray-400">
                            Repartidor: <span className="text-gray-200 font-semibold">{tracking.driverName}</span>
                        </p>
                    </div>
                </div>

                <div className="text-right">
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                        EN VIVO
                    </span>
                    <p className="text-[9px] text-gray-400 mt-1">
                        {lastUpdatedSecs < 10 ? 'Actualizado ahora' : `Hace ${lastUpdatedSecs}s`}
                    </p>
                </div>
            </header>

            {/* Contenedor del Mapa OpenStreetMap (Leaflet) a pantalla completa */}
            <div className="absolute inset-0 w-full h-full z-0">
                {tracking.lat && tracking.lng ? (
                    <div ref={mapContainerRef} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-gray-400 bg-[#0A0F1D]">
                        <span className="text-4xl mb-2">📡</span>
                        <p className="text-sm font-semibold text-white">Esperando señal GPS del repartidor...</p>
                        <p className="text-xs text-gray-500 mt-1 max-w-xs">
                            El repartidor acaba de iniciar su trayecto. En unos segundos se visualizará su posición en el mapa.
                        </p>
                    </div>
                )}
            </div>

            {/* Footer Flotante: TIEMPO ESTIMADO DE LLEGADA DEL REPARTIDOR */}
            <footer className="absolute bottom-4 left-4 right-4 z-[1000] bg-[#0F172A]/95 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl">
                <div className="max-w-md mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-2xl shadow-inner">
                            ⏱️
                        </div>
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                                {etaInfo.title}
                            </p>
                            <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                                {etaInfo.timeText}
                                {etaInfo.isNear && (
                                    <span className="text-[10px] bg-emerald-500 text-black font-black px-2 py-0.5 rounded-full uppercase">
                                        ¡Llegando!
                                    </span>
                                )}
                            </h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                                {etaInfo.subtitle}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end justify-center">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-gray-300 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            GPS Activo
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default ClientLiveTracking;
