import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = {};
fs.readFileSync('.env', 'utf8').split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

// Mock calculateRouteDistance and calculateGoogleDrivingDistance using calcHaversineDistance * 1.3
function calcHaversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateRouteDistance(startCoords, clients) {
  const points = [];
  const start = startCoords ? parseCoords(startCoords) : null;
  if (start) points.push(start);
  clients.forEach(c => {
    const p = parseCoords(c.coords);
    if (p) points.push(p);
  });
  if (points.length < 2) return 0;
  let dist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    dist += calcHaversineDistance(points[i].lat, points[i].lng, points[i+1].lat, points[i+1].lng);
  }
  return dist * 1.3;
}

function parseCoords(coordsStr) {
  if (!coordsStr) return null;
  const parts = coordsStr.split(',').map(p => parseFloat(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

const MORNING_SHEET_ID = "1fWjuO_bGy4cvO0-Ru-u2lbnJcD8ZJFg3ovTaD7kIDzE";
const MORNING_GID = "1075208342";
const EVENING_SHEET_ID = "1y7V-6nwmsJv_bY38PzjFhIFWaUPu8EW4IvQD23T008U";
const EVENING_GID = "2039339913";

function parseCsvContent(text) {
  const lines = text.split('\n');
  const rows = [];
  lines.forEach(line => {
    const clean = line.trim();
    if (!clean) return;
    let parts = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current);
    rows.push(parts);
  });
  return rows;
}

async function fetchMasterSheetClients(sheetId, gid) {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(csvUrl);
  const text = await response.text();
  const parsedRows = parseCsvContent(text);
  if (parsedRows.length < 2) return [];

  const headerFields = parsedRows[0].map(h => h.toUpperCase().trim().replace(/"/g, ''));
  const nameIdx = headerFields.findIndex(h => h.includes('NOMBRE'));
  const coordsIdx = headerFields.findIndex(h => h === 'UBICACIÓN' || h === 'UBICACION' || h === 'COORDENADAS' || h.includes('COORD'));
  const repartidorIdx = headerFields.findIndex(h => h.includes('REPARTIDOR'));

  const clients = [];
  for (let i = 1; i < parsedRows.length; i++) {
    const fields = parsedRows[i];
    const nameVal = nameIdx >= 0 ? (fields[nameIdx] || '').trim().replace(/"/g, '') : '';
    const repartidorVal = repartidorIdx >= 0 ? (fields[repartidorIdx] || '').trim().toUpperCase().replace(/"/g, '') : '';
    if (!nameVal || !repartidorVal) continue;

    clients.push({
      order: i,
      name: nameVal,
      repartidor: repartidorVal,
      coords: coordsIdx >= 0 ? (fields[coordsIdx] || '').trim().replace(/"/g, '') : '',
    });
  }
  return clients;
}

async function fetchDriverIndividualRoute(sheetUrl) {
    const stops = [];
    let startCoords = null;
    if (!sheetUrl) return { startCoords, stops };
    const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
    if (!sheetId) return { startCoords, stops };
    const gidMatch = sheetUrl.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    try {
        const response = await fetch(csvUrl);
        const text = await response.text();
        const parsedRows = parseCsvContent(text);
        if (parsedRows.length < 2) return { startCoords, stops };
        const header = parsedRows[0].map(h => h.toUpperCase().trim().replace(/"/g, ''));
        const ordenIdx = header.findIndex(h => h.includes('ORDEN'));
        const nombreIdx = header.findIndex(h => h.includes('NOMBRE'));
        const coordsIdx = header.findIndex(h => h === 'UBICACIÓN' || h === 'UBICACION' || h === 'COORDENADAS' || h.includes('COORD'));
        if (ordenIdx === -1 || nombreIdx === -1) return { startCoords, stops };
        for (let i = 1; i < parsedRows.length; i++) {
            const fields = parsedRows[i];
            const ordenVal = fields[ordenIdx];
            const orden = parseInt(ordenVal || '', 10);
            if (isNaN(orden)) continue;
            const nombre = (fields[nombreIdx] || '').trim().replace(/"/g, '');
            const coords = coordsIdx >= 0 ? (fields[coordsIdx] || '').trim().replace(/"/g, '') : '';
            if (orden === 0) {
                if (coords) startCoords = coords;
            } else if (nombre && coords) {
                stops.push({
                    order: orden,
                    name: nombre,
                    coords
                });
            }
        }
        stops.sort((a, b) => a.order - b.order);
    } catch (e) {}
    return { startCoords, stops };
}

async function run() {
  try {
    const { data: dbDrivers } = await supabase.from('drivers').select('*');
    const morningClients = await fetchMasterSheetClients(MORNING_SHEET_ID, MORNING_GID);
    const eveningClients = await fetchMasterSheetClients(EVENING_SHEET_ID, EVENING_GID);
    
    const morningMap = {};
    morningClients.forEach(c => {
      if (!morningMap[c.repartidor]) morningMap[c.repartidor] = [];
      morningMap[c.repartidor].push(c);
    });

    const eveningMap = {};
    eveningClients.forEach(c => {
      if (!eveningMap[c.repartidor]) eveningMap[c.repartidor] = [];
      eveningMap[c.repartidor].push(c);
    });

    const records = [];
    
    // Simulate calculation
    // Morning
    for (const [driverName, clients] of Object.entries(morningMap)) {
      const dbDriver = dbDrivers.find(d => d.name.toUpperCase().trim() === driverName.toUpperCase().trim());
      const driverSheetUrl = dbDriver?.morning_sheet_url || '';
      if (driverSheetUrl) {
        const { startCoords, stops } = await fetchDriverIndividualRoute(driverSheetUrl);
        if (stops.length > 0) {
          const totalKm = calculateRouteDistance(startCoords, stops);
          records.push({
            date: 'RM 03-08-26',
            driver: driverName,
            total_km: parseFloat(totalKm.toFixed(1)),
            route_km: parseFloat((totalKm * 0.85).toFixed(1)), // mock
            customers: stops.length
          });
        }
      }
    }

    // Evening
    for (const [driverName, clients] of Object.entries(eveningMap)) {
      const dbDriver = dbDrivers.find(d => d.name.toUpperCase().trim() === driverName.toUpperCase().trim());
      const driverSheetUrl = dbDriver?.evening_sheet_url || '';
      if (driverSheetUrl) {
        const { startCoords, stops } = await fetchDriverIndividualRoute(driverSheetUrl);
        if (stops.length > 0) {
          const totalKm = calculateRouteDistance(startCoords, stops);
          records.push({
            date: 'RV 02-08-26',
            driver: driverName,
            total_km: parseFloat(totalKm.toFixed(1)),
            route_km: parseFloat((totalKm * 0.85).toFixed(1)), // mock
            customers: stops.length
          });
        }
      }
    }

    console.log(`Generated ${records.length} records.`, records);
    
    if (records.length > 0) {
      console.log('Inserting into Supabase...');
      const { data, error } = await supabase.from('mileage_records').upsert(records, { onConflict: 'date,driver' });
      if (error) {
        console.error('Upsert failed:', error.message);
      } else {
        console.log('Upsert succeeded!');
      }
    }
  } catch (err) {
    console.error(err);
  }
}
run();
