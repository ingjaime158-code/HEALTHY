/**
 * routeMonitorService.ts
 * Parses master Google Sheet CSV to determine active drivers per route,
 * fetches each driver's individual Google Sheet to obtain the correct
 * delivery ORDEN, and computes per-driver progress using delivery_logs.
 *
 * Master Sheet columns: ESTADO | NOMBRE | TELEFONO | DIRECCIÓN | LINK DE UBICACIÓN | UBICACIÓN | REPARTIDOR
 * Driver Sheet columns: ORDEN | NOMBRE | TELEFONO | DIRECCIÓN | LINK DE UBICACIÓN | UBICACIÓN | REPARTIDOR
 */

import { supabase } from './supabaseClient';
import { checkMapQuota, incrementMapQuota } from './mapsQuotaService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RouteClient {
  order: number;
  name: string;
  phone: string;
  address: string;
  locationLink: string;
  coords: string;
  repartidor: string;
  bags: number;
  isDelivered?: boolean;
  estimatedTimeMins?: number; // New: ETA in minutes
  estimatedTimeClock?: string; // New: ETA clock string or status
}

export interface DriverRouteInfo {
  driverName: string;
  driverId: string | null;
  totalClients: number;
  deliveredCount: number;
  currentClient: string;
  nextClientOrder: number;
  status: 'en_curso' | 'finalizada' | 'sin_iniciar';
  clients: RouteClient[];
  colorHex: string | null;
  lastDeliveredAt: string | null;
  estimatedDistanceKm?: number; // New: Theoretical route distance in km
}

// ── CSV Parser ───────────────────────────────────────────────────────────────

function parseCsvContent(text: string): string[][] {
  const result: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
      currentRow.push(currentField.trim());
      result.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    result.push(currentRow);
  }

  return result.filter(row => row.some(field => field.length > 0));
}

// ── Convert Google Sheets URL to CSV export URL ──────────────────────────────

function getSheetCsvUrl(sheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

/**
 * Extracts a Google Sheets document ID from a full URL.
 * e.g. "https://docs.google.com/spreadsheets/d/1yGRXWag-CchdfZb6sVD7dfTTnitAPBfmcriFiwtYTZU/edit#gid=0"
 *   => "1yGRXWag-CchdfZb6sVD7dfTTnitAPBfmcriFiwtYTZU"
 */
function extractSheetId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Extracts the gid from a Google Sheets URL, defaults to "0".
 */
function extractGid(url: string): string {
  if (!url) return '0';
  const match = url.match(/gid=(\d+)/);
  return match ? match[1] : '0';
}

// ── Fetch and parse master sheet ─────────────────────────────────────────────

export async function fetchMasterSheetClients(
  sheetId: string,
  gid: string
): Promise<RouteClient[]> {
  const csvUrl = getSheetCsvUrl(sheetId, gid);
  const response = await fetch(csvUrl);

  if (!response.ok) {
    throw new Error(`Error al obtener la hoja maestra (HTTP ${response.status})`);
  }

  const text = await response.text();
  const parsedRows = parseCsvContent(text);

  if (parsedRows.length < 2) return [];

  const headerFields = parsedRows[0].map(h => h.toUpperCase());

  const nameIdx = headerFields.findIndex(h => h.includes('NOMBRE'));
  const phoneIdx = headerFields.findIndex(h => h.includes('TELEFONO') || h.includes('TELÉFONO'));
  const addressIdx = headerFields.findIndex(h => h.includes('DIRECCI') || h.includes('DIRECCION'));
  const linkIdx = headerFields.findIndex(h => h.includes('LINK'));
  const coordsIdx = headerFields.findIndex(h => h === 'UBICACIÓN' || h === 'UBICACION');
  const bagsIdx = headerFields.findIndex(h => h.includes('BOLSA'));
  const repartidorIdx = headerFields.findIndex(h => h.includes('REPARTIDOR'));

  if (nameIdx === -1) {
    throw new Error('No se encontró la columna NOMBRE en la hoja maestra');
  }
  if (repartidorIdx === -1) {
    throw new Error('No se encontró la columna REPARTIDOR en la hoja maestra');
  }

  const clients: RouteClient[] = [];

  for (let i = 1; i < parsedRows.length; i++) {
    const fields = parsedRows[i];

    const nameVal = nameIdx >= 0 ? (fields[nameIdx] || '').trim() : '';
    const repartidorVal = repartidorIdx >= 0 ? (fields[repartidorIdx] || '').trim().toUpperCase() : '';

    if (!nameVal || !repartidorVal) continue;

    const locationLinkVal = linkIdx >= 0 ? (fields[linkIdx] || '').trim() : '';
    let coordsVal = coordsIdx >= 0 ? (fields[coordsIdx] || '').trim() : '';

    // Blindaje 1: Si coords está vacío o es en realidad un link, intentamos extraer del link
    if ((!coordsVal || coordsVal.startsWith('http')) && locationLinkVal) {
      coordsVal = extractCoordsFromLink(locationLinkVal) || '';
    }

    clients.push({
      order: i,
      name: nameVal,
      phone: phoneIdx >= 0 ? (fields[phoneIdx] || '').trim() : '',
      address: addressIdx >= 0 ? (fields[addressIdx] || '').trim() : '',
      locationLink: locationLinkVal,
      coords: coordsVal,
      repartidor: repartidorVal,
      bags: bagsIdx >= 0 ? (parseInt(fields[bagsIdx] || '0', 10) || 0) : 0,
    });
  }

  return clients;
}

// ── Fetch a driver's individual sheet to get the ORDEN mapping ───────────────

/**
 * Normalizes text to ignore accents, extra spaces, and case differences
 * to improve matching between Master Sheet and Driver Sheets.
 */
function normalizeName(name: string): string {
  if (!name) return '';
  return name.toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^\w\s]/gi, '') // Remove special characters
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Computes a similarity score (0-1) between two strings using
 * longest common subsequence ratio. Used for fuzzy name matching.
 */
function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const lenA = a.length, lenB = b.length;
  // LCS via dynamic programming
  const dp: number[][] = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const lcs = dp[lenA][lenB];
  return (2 * lcs) / (lenA + lenB); // Dice-style ratio
}

/**
 * Finds the best matching ORDEN for a given client name from the orderMap.
 * First tries exact match, then falls back to fuzzy matching (threshold ≥ 0.75).
 */
function findOrderForClient(
  normalizedClientName: string,
  orderMap: Map<string, { orden: number; bags: number }>
): { orden: number; bags: number } | undefined {
  // 1. Exact match
  const exact = orderMap.get(normalizedClientName);
  if (exact !== undefined) return exact;

  // 2. Check if one contains the other (substring match)
  for (const [sheetName, data] of orderMap) {
    if (normalizedClientName.includes(sheetName) || sheetName.includes(normalizedClientName)) {
      return data;
    }
  }

  // 3. Fuzzy match — pick best candidate above threshold
  let bestScore = 0;
  let bestData: { orden: number; bags: number } | undefined;
  for (const [sheetName, data] of orderMap) {
    const score = similarityScore(normalizedClientName, sheetName);
    if (score > bestScore) {
      bestScore = score;
      bestData = data;
    }
  }

  if (bestScore >= 0.75 && bestData !== undefined) {
    return bestData;
  }

  return undefined;
}

/**
 * Extracts coordinates from Google Maps links.
 */
function extractCoordsFromLink(url: string): string | null {
  if (!url) return null;
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return `${atMatch[1]}, ${atMatch[2]}`;
  const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) return `${qMatch[1]}, ${qMatch[2]}`;
  const llMatch = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (llMatch) return `${llMatch[1]}, ${llMatch[2]}`;
  const generalMatch = url.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (generalMatch && (url.includes('google.com/maps') || url.includes('goo.gl/maps'))) {
    return `${generalMatch[1]}, ${generalMatch[2]}`;
  }
  return null;
}

export function parseCoords(coordsStr: string): { lat: number; lng: number } | null {
  if (!coordsStr) return null;
  const parts = coordsStr.split(',').map(p => parseFloat(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

function calcHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateHaversineDistance(points: { lat: number; lng: number }[]): number {
  let totalDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalDistance += calcHaversineDistance(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  return parseFloat((totalDistance * 1.25).toFixed(2));
}

export async function calculateGoogleDrivingDistance(
  points: { lat: number; lng: number }[]
): Promise<number> {
  if (points.length < 2) return 0;

  if (typeof google === 'undefined' || !google.maps) {
    console.warn('[routeMonitor] Google Maps JavaScript API not loaded. Using Haversine.');
    return calculateHaversineDistance(points);
  }

  try {
    const directionsService = new google.maps.DirectionsService();
    let totalDistance = 0;
    const maxSegmentSize = 25;

    for (let i = 0; i < points.length - 1; i += maxSegmentSize - 1) {
      const segmentPoints = points.slice(i, i + maxSegmentSize);
      if (segmentPoints.length < 2) break;

      const origin = segmentPoints[0];
      const destination = segmentPoints[segmentPoints.length - 1];
      const waypoints = segmentPoints.slice(1, segmentPoints.length - 1).map(p => ({
        location: p,
        stopover: true
      }));

      if (typeof checkMapQuota === 'function' && !checkMapQuota()) {
        console.warn('[routeMonitor] Maps daily quota exceeded. Using Haversine.');
        throw new Error('Quota exceeded');
      }

      if (typeof incrementMapQuota === 'function') {
        incrementMapQuota();
      }

      const response: google.maps.DirectionsResult = await new Promise((resolve, reject) => {
        directionsService.route(
          {
            origin,
            destination,
            waypoints,
            travelMode: google.maps.TravelMode.DRIVING
          },
          (res, status) => {
            if (status === google.maps.DirectionsStatus.OK && res) {
              resolve(res);
            } else {
              reject(new Error(`Directions API failed: ${status}`));
            }
          }
        );
      });

      const route = response.routes[0];
      if (route && route.legs) {
        for (const leg of route.legs) {
          totalDistance += (leg.distance?.value || 0) / 1000;
        }
      }
    }

    return parseFloat(totalDistance.toFixed(2));
  } catch (err) {
    console.warn('[routeMonitor] Google Directions failed, using Haversine:', err);
    return calculateHaversineDistance(points);
  }
}

export async function calculateRouteDistance(
  startCoords: string | null,
  clients: RouteClient[]
): Promise<number> {
  const points: { lat: number; lng: number }[] = [];
  const start = startCoords ? parseCoords(startCoords) : null;
  if (start) {
    points.push(start);
  } else if (clients.length > 0) {
    const first = parseCoords(clients[0].coords);
    if (first) points.push(first);
  }

  for (const c of clients) {
    const p = parseCoords(c.coords);
    if (p) points.push(p);
  }

  return calculateGoogleDrivingDistance(points);
}

export async function calculateRouteETAs(
  startCoords: string | null,
  clients: RouteClient[]
): Promise<number[]> {
  if (clients.length === 0) return [];

  const points: { lat: number; lng: number }[] = [];
  const start = startCoords ? parseCoords(startCoords) : null;
  if (start) {
    points.push(start);
  } else {
    const first = parseCoords(clients[0].coords);
    if (first) points.push(first);
  }

  for (const client of clients) {
    const p = parseCoords(client.coords);
    if (p) {
      points.push(p);
    } else if (points.length > 0) {
      points.push(points[points.length - 1]);
    }
  }

  if (points.length < 2) {
    return new Array(clients.length).fill(0);
  }

  const legDurationsSec: number[] = new Array(points.length - 1).fill(0);
  let googleSuccess = false;

  if (typeof google !== 'undefined' && google.maps) {
    try {
      const directionsService = new google.maps.DirectionsService();
      const maxSegmentSize = 25;

      for (let i = 0; i < points.length - 1; i += maxSegmentSize - 1) {
        const segmentPoints = points.slice(i, i + maxSegmentSize);
        if (segmentPoints.length < 2) break;

        const origin = segmentPoints[0];
        const destination = segmentPoints[segmentPoints.length - 1];
        const waypoints = segmentPoints.slice(1, segmentPoints.length - 1).map(p => ({
          location: p,
          stopover: true
        }));

        if (typeof checkMapQuota === 'function' && checkMapQuota()) {
          incrementMapQuota();

          const response: google.maps.DirectionsResult = await new Promise((resolve, reject) => {
            directionsService.route(
              {
                origin,
                destination,
                waypoints,
                travelMode: google.maps.TravelMode.DRIVING
              },
              (res, status) => {
                if (status === google.maps.DirectionsStatus.OK && res) {
                  resolve(res);
                } else {
                  reject(new Error(`Directions API failed: ${status}`));
                }
              }
            );
          });

          const route = response.routes[0];
          if (route && route.legs) {
            for (let legIdx = 0; legIdx < route.legs.length; legIdx++) {
              const globalLegIdx = i + legIdx;
              if (globalLegIdx < legDurationsSec.length) {
                legDurationsSec[globalLegIdx] = route.legs[legIdx].duration?.value || 0;
              }
            }
          }
          googleSuccess = true;
        }
      }
    } catch (err) {
      console.warn('[routeMonitor] Google ETA service failed, fallback to Haversine duration math:', err);
    }
  }

  if (!googleSuccess) {
    for (let i = 0; i < points.length - 1; i++) {
      const dist = calcHaversineDistance(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
      const estimatedDist = dist * 1.25;
      legDurationsSec[i] = (estimatedDist / 30) * 3600;
    }
  }

  const etas: number[] = [];
  let cumulativeTimeMins = 0;

  for (let i = 0; i < clients.length; i++) {
    const legDrivingTimeMins = legDurationsSec[i] / 60;
    if (i === 0) {
      cumulativeTimeMins += legDrivingTimeMins;
    } else {
      cumulativeTimeMins += 5 + legDrivingTimeMins;
    }
    etas.push(Math.round(cumulativeTimeMins));
  }

  return etas;
}

interface DriverOrderData {
  orderMap: Map<string, { orden: number; bags: number }>;
  startCoords: string | null;
}

/**
 * Downloads a driver's individual route sheet and returns client orders and start coords.
 */
export async function fetchDriverOrderMap(sheetUrl: string): Promise<DriverOrderData> {
  const orderMap = new Map<string, { orden: number; bags: number }>();
  let startCoords: string | null = null;

  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) return { orderMap, startCoords };

  const gid = extractGid(sheetUrl);
  const csvUrl = getSheetCsvUrl(sheetId, gid);

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      console.warn(`[routeMonitor] Could not fetch driver sheet (HTTP ${response.status}): ${sheetUrl}`);
      return { orderMap, startCoords };
    }

    const text = await response.text();
    const parsedRows = parseCsvContent(text);
    if (parsedRows.length < 2) return { orderMap, startCoords };

    const header = parsedRows[0].map(h => h.toUpperCase());

    const ordenIdx = header.findIndex(h => h.includes('ORDEN'));
    const nombreIdx = header.findIndex(h => h.includes('NOMBRE'));
    const bagsIdx = header.findIndex(h => h.includes('BOLSA'));
    const linkIdx = header.findIndex(h => h.includes('LINK'));
    const coordsIdx = header.findIndex(h => h === 'UBICACIÓN' || h === 'UBICACION');

    if (ordenIdx === -1 || nombreIdx === -1) {
      console.warn('[routeMonitor] Driver sheet missing ORDEN or NOMBRE column. Header:', header);
      return { orderMap, startCoords };
    }

    for (let i = 1; i < parsedRows.length; i++) {
      const fields = parsedRows[i];
      const orden = parseInt(fields[ordenIdx] || '', 10);
      const nombre = normalizeName(fields[nombreIdx] || '');
      const bags = bagsIdx >= 0 ? (parseInt(fields[bagsIdx] || '0', 10) || 0) : 0;

      if (orden === 0) {
        let coords = coordsIdx >= 0 ? (fields[coordsIdx] || '').trim() : '';
        const link = linkIdx >= 0 ? (fields[linkIdx] || '').trim() : '';
        if (!coords && link) {
          coords = extractCoordsFromLink(link) || '';
        }
        if (coords) {
          startCoords = coords;
        }
        continue;
      }

      if (isNaN(orden) || !nombre) continue;

      orderMap.set(nombre, { orden, bags });
    }

    console.log(`[routeMonitor] Driver sheet parsed: ${orderMap.size} client orders loaded`);
  } catch (err) {
    console.warn('[routeMonitor] Error fetching driver sheet:', err);
  }

  return { orderMap, startCoords };
}


// ── Fetch delivery logs for today ────────────────────────────────────────────

export interface DeliveryLog {
  driver_id: string;
  client_name: string;
  client_order: number;
  route_type: string;
  status: string;
  delivered_at: string;
  delivery_date: string;
}

export async function fetchTodayDeliveryLogs(
  routeType: 'morning' | 'evening'
): Promise<DeliveryLog[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('delivery_logs')
    .select('*')
    .eq('route_type', routeType)
    .eq('delivery_date', today)
    .eq('status', 'delivered');

  if (error) {
    console.warn('[routeMonitor] Error fetching delivery logs:', error.message);
    return [];
  }

  return data || [];
}

// ── Build driver progress from master sheet + individual driver sheets ────────

export async function buildDriverProgress(
  sheetId: string,
  gid: string,
  routeType: 'morning' | 'evening',
  driversDb: { id: string; name: string; color_hex?: string; morning_sheet_url?: string; evening_sheet_url?: string }[]
): Promise<DriverRouteInfo[]> {

  // 1. Fetch master sheet
  const allClients = await fetchMasterSheetClients(sheetId, gid);

  // 2. Blindaje 2: Recuperar coordenadas oficiales de la base de datos Supabase
  try {
    const { data: dbBusinesses } = await supabase
      .from('businesses')
      .select('name, lat, lng, location_link');

    if (dbBusinesses && dbBusinesses.length > 0) {
      const businessCoordsMap = new Map<string, { lat: number; lng: number }>();
      for (const b of dbBusinesses) {
        if (b.name && b.lat && b.lng) {
          businessCoordsMap.set(normalizeName(b.name), { lat: Number(b.lat), lng: Number(b.lng) });
        }
      }

      for (const client of allClients) {
        const parsed = parseCoords(client.coords);
        if (!parsed) {
          const normalizedClientName = normalizeName(client.name);
          const dbCoords = businessCoordsMap.get(normalizedClientName);
          if (dbCoords) {
            client.coords = `${dbCoords.lat}, ${dbCoords.lng}`;
            console.log(`[routeMonitor] Fallback coords used for "${client.name}" from Supabase: ${client.coords}`);
          } else if (client.locationLink) {
            const extracted = extractCoordsFromLink(client.locationLink);
            if (extracted) {
              client.coords = extracted;
              console.log(`[routeMonitor] Extracted coords from link for "${client.name}": ${extracted}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[routeMonitor] Failed to fetch fallback business coordinates from Supabase:', err);
  }

  // 3. Fetch today's delivery logs
  const logs = await fetchTodayDeliveryLogs(routeType);

  // 3. Group clients by REPARTIDOR
  const driverMap = new Map<string, RouteClient[]>();
  for (const client of allClients) {
    const key = client.repartidor;
    if (!driverMap.has(key)) driverMap.set(key, []);
    driverMap.get(key)!.push(client);
  }

  const driverStartCoordsMap = new Map<string, string | null>();

  // 4. For each driver, fetch their individual sheet to get the correct ORDEN
  //    and apply it to the client list, skipping ORDEN 0 (PUNTO DE INICIO)
  for (const [driverName, clients] of driverMap) {
    // Find matching DB driver - Strict match first
    let dbDriver = driversDb.find(d => d.name.toUpperCase().trim() === driverName.toUpperCase().trim());
    
    if (!dbDriver) {
        // Fallback: Pick the best partial match (closest length) to avoid 'BRAYAN' mapping to 'BRAYAN 2'
        const partialMatches = driversDb.filter(d => 
            d.name.toUpperCase().includes(driverName.toUpperCase().trim()) || 
            driverName.toUpperCase().trim().includes(d.name.toUpperCase())
        );
        if (partialMatches.length > 0) {
            partialMatches.sort((a, b) => Math.abs(a.name.length - driverName.length) - Math.abs(b.name.length - driverName.length));
            dbDriver = partialMatches[0];
        }
    }

    // Get the driver's individual sheet URL
    const driverSheetUrl = dbDriver
      ? (routeType === 'morning' ? dbDriver.morning_sheet_url : dbDriver.evening_sheet_url) || ''
      : '';

    if (driverSheetUrl) {
      // Fetch the driver's individual ORDEN mapping and start coordinates
      const { orderMap, startCoords } = await fetchDriverOrderMap(driverSheetUrl);
      driverStartCoordsMap.set(driverName, startCoords);

      if (orderMap.size > 0) {
        let matchedCount = 0;
        // Apply ORDEN and BOLSAS from the driver's sheet to each client
        for (const client of clients) {
          const normalizedClientName = normalizeName(client.name);
          const driverData = findOrderForClient(normalizedClientName, orderMap);
          if (driverData !== undefined) {
            client.order = driverData.orden;
            client.bags = driverData.bags > 0 ? driverData.bags : client.bags; // Prefer driver sheet bags, fallback to master
            matchedCount++;
          } else {
            // Unmatched clients go to the bottom
            client.order = 9999 + clients.indexOf(client);
            console.warn(`[routeMonitor] ⚠ No order match for "${client.name}" (normalized: "${normalizedClientName}") in ${driverName}'s sheet`);
          }
        }
        console.log(`[routeMonitor] ✅ ${driverName}: ${matchedCount}/${clients.length} clients matched with ORDEN from individual sheet`);
      } else {
        console.warn(`[routeMonitor] ⚠ ${driverName}: driver sheet returned empty order map`);
      }
    } else {
      driverStartCoordsMap.set(driverName, null);
      console.warn(`[routeMonitor] ⚠ ${driverName}: no individual sheet URL found (dbDriver: ${dbDriver?.name || 'NOT FOUND'})`);
    }

    // Sort clients by the order retrieved from the driver's individual sheet
    clients.sort((a, b) => a.order - b.order);
  }

  // 5. Build driver info with progress
  const result: DriverRouteInfo[] = [];

  for (const [driverName, clients] of driverMap) {
    // Match to DB driver using same strict-first logic
    let dbDriver = driversDb.find(d => d.name.toUpperCase().trim() === driverName.toUpperCase().trim());
    if (!dbDriver) {
        const partialMatches = driversDb.filter(d => 
            d.name.toUpperCase().includes(driverName.toUpperCase().trim()) || 
            driverName.toUpperCase().trim().includes(d.name.toUpperCase())
        );
        if (partialMatches.length > 0) {
            partialMatches.sort((a, b) => Math.abs(a.name.length - driverName.length) - Math.abs(b.name.length - driverName.length));
            dbDriver = partialMatches[0];
        }
    }

    // Get delivered clients from logs (match by driver name or ID)
    const driverLogs = logs.filter(log => {
      if (dbDriver && log.driver_id === dbDriver.id) return true;
      // Fallback: match by client name in case driver_id doesn't match
      return clients.some(c =>
        normalizeName(c.name) === normalizeName(log.client_name || '')
      );
    });

    const deliveredNames = new Set(
      driverLogs.map(l => l.client_name.toUpperCase())
    );

    const deliveredCount = clients.filter(c =>
      deliveredNames.has(c.name.toUpperCase())
    ).length;

    // Attach isDelivered flag to each client
    for (const client of clients) {
      client.isDelivered = deliveredNames.has(client.name.toUpperCase());
    }

    // Find next pending client
    const pendingClients = clients.filter(c => !c.isDelivered);
    const currentClient = pendingClients.length > 0
      ? pendingClients[0].name
      : '';

    // Status
    let status: DriverRouteInfo['status'] = 'sin_iniciar';
    if (deliveredCount > 0 && deliveredCount < clients.length) {
      status = 'en_curso';
    } else if (deliveredCount >= clients.length && clients.length > 0) {
      status = 'finalizada';
    }

    // Last delivery time
    const lastLog = driverLogs
      .filter(l => l.delivered_at)
      .sort((a, b) => new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime())[0];

    // Compute ETAs sequentially for the sorted clients
    const startCoords = driverStartCoordsMap.get(driverName) || null;
    const etas = await calculateRouteETAs(startCoords, clients);
    for (let i = 0; i < clients.length; i++) {
      clients[i].estimatedTimeMins = etas[i];
    }

    // Proyección inteligente de horas aproximadas en reloj basadas en la última entrega
    const completedLogs = driverLogs
      .filter(l => l.delivered_at)
      .sort((a, b) => new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime());

    const latestLog = completedLogs[0];
    let anchorClient = null;
    let anchorTimeMins = 0;
    let anchorTimeReal: Date | null = null;

    if (latestLog) {
      anchorClient = clients.find(c => normalizeName(c.name) === normalizeName(latestLog.client_name || ''));
      if (anchorClient && anchorClient.estimatedTimeMins !== undefined) {
        anchorTimeMins = anchorClient.estimatedTimeMins;
        anchorTimeReal = new Date(latestLog.delivered_at);
      }
    }

    for (const client of clients) {
      if (client.isDelivered) {
        const log = driverLogs.find(l => normalizeName(l.client_name || '') === normalizeName(client.name));
        if (log && log.delivered_at) {
          const delTime = new Date(log.delivered_at);
          const hours = delTime.getHours();
          const minutes = delTime.getMinutes();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const formattedHours = hours % 12 || 12;
          const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
          client.estimatedTimeClock = `Entregado: ${formattedHours}:${formattedMinutes} ${ampm}`;
        }
      } else if (anchorTimeReal && client.estimatedTimeMins !== undefined) {
        const deltaMins = Math.max(5, client.estimatedTimeMins - anchorTimeMins);
        const estimatedTime = new Date(anchorTimeReal.getTime() + deltaMins * 60 * 1000);
        
        const hours = estimatedTime.getHours();
        const minutes = estimatedTime.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHours = hours % 12 || 12;
        const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
        
        client.estimatedTimeClock = `${formattedHours}:${formattedMinutes} ${ampm}`;
      }
    }

    result.push({
      driverName,
      driverId: dbDriver?.id || null,
      totalClients: clients.length,
      deliveredCount,
      currentClient,
      nextClientOrder: pendingClients.length > 0 ? pendingClients[0].order : 0,
      status,
      clients,
      colorHex: dbDriver?.color_hex || null,
      lastDeliveredAt: lastLog?.delivered_at || null,
    });
  }

  // Sort: en_curso first, then sin_iniciar, then finalizada
  result.sort((a, b) => {
    const order = { en_curso: 0, sin_iniciar: 1, finalizada: 2 };
    return order[a.status] - order[b.status];
  });

  return result;
}
