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
  locationLink: string;
  coords: string;
  repartidor: string;
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

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
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
  const lines = text.split('\n').filter(l => l.trim().length > 0);

  if (lines.length < 2) return [];

  // Parse header
  const headerFields = parseCsvLine(lines[0]).map(h => h.toUpperCase().replace(/\r/g, '').trim());

  const nameIdx = headerFields.findIndex(h => h.includes('NOMBRE'));
  const phoneIdx = headerFields.findIndex(h => h.includes('TELEFONO') || h.includes('TELÉFONO'));
  const addressIdx = headerFields.findIndex(h => h.includes('DIRECCI') || h.includes('DIRECCION'));
  // LINK column must contain 'LINK' — don't match bare 'UBICAC' here to avoid stealing the coords column
  const linkIdx = headerFields.findIndex(h => h.includes('LINK'));
  // UBICACIÓN column (exact match for coordinates)
  const coordsIdx = headerFields.findIndex(h => h === 'UBICACIÓN' || h === 'UBICACION');
  const repartidorIdx = headerFields.findIndex(h => h.includes('REPARTIDOR'));

  if (nameIdx === -1) {
    throw new Error('No se encontró la columna NOMBRE en la hoja maestra');
  }
  if (repartidorIdx === -1) {
    throw new Error('No se encontró la columna REPARTIDOR en la hoja maestra');
  }

  const clients: RouteClient[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i].replace(/\r/g, ''));

    const nameVal = nameIdx >= 0 ? (fields[nameIdx] || '').trim() : '';
    const repartidorVal = repartidorIdx >= 0 ? (fields[repartidorIdx] || '').trim().toUpperCase() : '';

    if (!nameVal || !repartidorVal) continue;

    // Use the CSV row index as a temporary order — it will be overridden
    // with the real ORDEN from each driver's individual sheet later.
    clients.push({
      order: i,
      name: nameVal,
      phone: phoneIdx >= 0 ? (fields[phoneIdx] || '').trim() : '',
      address: addressIdx >= 0 ? (fields[addressIdx] || '').trim() : '',
      locationLink: linkIdx >= 0 ? (fields[linkIdx] || '').trim() : '',
      coords: coordsIdx >= 0 ? (fields[coordsIdx] || '').trim() : '',
      repartidor: repartidorVal,
    });
  }

  return clients;
}

// ── Fetch a driver's individual sheet to get the ORDEN mapping ───────────────

/**
 * Downloads a driver's individual route sheet and returns a Map of
 * uppercased client name → ORDEN number.
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
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) return orderMap;

    const header = parseCsvLine(lines[0]).map(h => h.toUpperCase().replace(/\r/g, '').trim());

    // Look specifically for ORDEN column
    const ordenIdx = header.findIndex(h => h === 'ORDEN');
    const nombreIdx = header.findIndex(h => h.includes('NOMBRE'));

    if (ordenIdx === -1 || nombreIdx === -1) {
      console.warn('[routeMonitor] Driver sheet missing ORDEN or NOMBRE column. Header:', header);
      return orderMap;
    }

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i].replace(/\r/g, ''));
      const orden = parseInt(fields[ordenIdx] || '', 10);
      const nombre = (fields[nombreIdx] || '').trim().toUpperCase();

      // Skip ORDEN 0 (PUNTO DE INICIO) and invalid entries
      if (isNaN(orden) || orden === 0 || !nombre) continue;

      orderMap.set(nombre, orden);
    }
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
    // Find matching DB driver
    const dbDriver = driversDb.find(d =>
      d.name.toUpperCase().includes(driverName) ||
      driverName.includes(d.name.toUpperCase())
    );

    // Get the driver's individual sheet URL
    const driverSheetUrl = dbDriver
      ? (routeType === 'morning' ? dbDriver.morning_sheet_url : dbDriver.evening_sheet_url) || ''
      : '';

    if (driverSheetUrl) {
      // Fetch the driver's individual ORDEN mapping
      const orderMap = await fetchDriverOrderMap(driverSheetUrl);

      if (orderMap.size > 0) {
        // Apply ORDEN from the driver's sheet to each client
        for (const client of clients) {
          const driverOrder = orderMap.get(client.name.toUpperCase());
          if (driverOrder !== undefined) {
            client.order = driverOrder;
          }
          // If no match found, keep the original CSV row index as fallback
        }
      }
    }

    // Sort clients by the order retrieved from the driver's individual sheet
    clients.sort((a, b) => a.order - b.order);
  }

  // 5. Build driver info with progress
  const result: DriverRouteInfo[] = [];

  for (const [driverName, clients] of driverMap) {
    // Match to DB driver (case-insensitive, partial match)
    const dbDriver = driversDb.find(d =>
      d.name.toUpperCase().includes(driverName) ||
      driverName.includes(d.name.toUpperCase())
    );

    // Get delivered clients from logs (match by driver name or ID)
    const driverLogs = logs.filter(log => {
      if (dbDriver && log.driver_id === dbDriver.id) return true;
      // Fallback: match by client name in case driver_id doesn't match
      return clients.some(c =>
        c.name.toUpperCase() === (log.client_name || '').toUpperCase()
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
