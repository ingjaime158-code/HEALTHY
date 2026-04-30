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

    clients.push({
      order: i,
      name: nameVal,
      phone: phoneIdx >= 0 ? (fields[phoneIdx] || '').trim() : '',
      address: addressIdx >= 0 ? (fields[addressIdx] || '').trim() : '',
      locationLink: linkIdx >= 0 ? (fields[linkIdx] || '').trim() : '',
      coords: coordsIdx >= 0 ? (fields[coordsIdx] || '').trim() : '',
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
  orderMap: Map<string, number>
): number | undefined {
  // 1. Exact match
  const exact = orderMap.get(normalizedClientName);
  if (exact !== undefined) return exact;

  // 2. Check if one contains the other (substring match)
  for (const [sheetName, orden] of orderMap) {
    if (normalizedClientName.includes(sheetName) || sheetName.includes(normalizedClientName)) {
      return orden;
    }
  }

  // 3. Fuzzy match — pick best candidate above threshold
  let bestScore = 0;
  let bestOrden: number | undefined;
  for (const [sheetName, orden] of orderMap) {
    const score = similarityScore(normalizedClientName, sheetName);
    if (score > bestScore) {
      bestScore = score;
      bestOrden = orden;
    }
  }

  if (bestScore >= 0.75 && bestOrden !== undefined) {
    return bestOrden;
  }

  return undefined;
}

/**
 * Downloads a driver's individual route sheet and returns a Map of
 * normalized client name → ORDEN number.
 * Entries with ORDEN = 0 (PUNTO DE INICIO) are excluded.
 */
async function fetchDriverOrderMap(sheetUrl: string): Promise<Map<string, number>> {
  const orderMap = new Map<string, number>();

  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) return orderMap;

  const gid = extractGid(sheetUrl);
  const csvUrl = getSheetCsvUrl(sheetId, gid);

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      console.warn(`[routeMonitor] Could not fetch driver sheet (HTTP ${response.status}): ${sheetUrl}`);
      return orderMap;
    }

    const text = await response.text();
    const parsedRows = parseCsvContent(text);
    if (parsedRows.length < 2) return orderMap;

    const header = parsedRows[0].map(h => h.toUpperCase());

    // Look specifically for ORDEN column
    const ordenIdx = header.findIndex(h => h.includes('ORDEN'));
    const nombreIdx = header.findIndex(h => h.includes('NOMBRE'));

    if (ordenIdx === -1 || nombreIdx === -1) {
      console.warn('[routeMonitor] Driver sheet missing ORDEN or NOMBRE column. Header:', header);
      return orderMap;
    }

    for (let i = 1; i < parsedRows.length; i++) {
      const fields = parsedRows[i];
      const orden = parseInt(fields[ordenIdx] || '', 10);
      const nombre = normalizeName(fields[nombreIdx] || '');

      // Skip ORDEN 0 (PUNTO DE INICIO) and invalid entries
      if (isNaN(orden) || orden === 0 || !nombre) continue;

      orderMap.set(nombre, orden);
    }

    console.log(`[routeMonitor] Driver sheet parsed: ${orderMap.size} client orders loaded`);
  } catch (err) {
    console.warn('[routeMonitor] Error fetching driver sheet:', err);
  }

  return orderMap;
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

  // 2. Fetch today's delivery logs
  const logs = await fetchTodayDeliveryLogs(routeType);

  // 3. Group clients by REPARTIDOR
  const driverMap = new Map<string, RouteClient[]>();
  for (const client of allClients) {
    const key = client.repartidor;
    if (!driverMap.has(key)) driverMap.set(key, []);
    driverMap.get(key)!.push(client);
  }

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
      // Fetch the driver's individual ORDEN mapping
      const orderMap = await fetchDriverOrderMap(driverSheetUrl);

      if (orderMap.size > 0) {
        let matchedCount = 0;
        // Apply ORDEN from the driver's sheet to each client
        for (const client of clients) {
          const normalizedClientName = normalizeName(client.name);
          const driverOrder = findOrderForClient(normalizedClientName, orderMap);
          if (driverOrder !== undefined) {
            client.order = driverOrder;
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
