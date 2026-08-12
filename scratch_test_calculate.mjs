import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env variables
const env = {};
fs.readFileSync('.env', 'utf8').split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

const MORNING_SHEET_ID = "1fWjuO_bGy4cvO0-Ru-u2lbnJcD8ZJFg3ovTaD7kIDzE";
const MORNING_GID = "1075208342";
const EVENING_SHEET_ID = "1y7V-6nwmsJv_bY38PzjFhIFWaUPu8EW4IvQD23T008U";
const EVENING_GID = "2039339913";

function parseCoords(coordsStr) {
  if (!coordsStr) return null;
  const parts = coordsStr.split(',').map(p => parseFloat(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

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
  if (!response.ok) {
    throw new Error(`Error al obtener la hoja maestra (HTTP ${response.status})`);
  }
  const text = await response.text();
  const parsedRows = parseCsvContent(text);
  if (parsedRows.length < 2) return [];

  const headerFields = parsedRows[0].map(h => h.toUpperCase().trim());
  const nameIdx = headerFields.findIndex(h => h.includes('NOMBRE'));
  const phoneIdx = headerFields.findIndex(h => h.includes('TELEFONO') || h.includes('TELÉFONO'));
  const addressIdx = headerFields.findIndex(h => h.includes('DIRECCI') || h.includes('DIRECCION'));
  const linkIdx = headerFields.findIndex(h => h.includes('LINK'));
  const coordsIdx = headerFields.findIndex(h => h === 'UBICACIÓN' || h === 'UBICACION' || h === 'COORDENADAS' || h.includes('COORD'));
  const bagsIdx = headerFields.findIndex(h => h.includes('BOLSA'));
  const repartidorIdx = headerFields.findIndex(h => h.includes('REPARTIDOR'));

  if (nameIdx === -1 || repartidorIdx === -1) {
    throw new Error(`Columnas obligatorias no encontradas en GID ${gid}. Nombre: ${nameIdx}, Repartidor: ${repartidorIdx}`);
  }

  const clients = [];
  for (let i = 1; i < parsedRows.length; i++) {
    const fields = parsedRows[i];
    const nameVal = nameIdx >= 0 ? (fields[nameIdx] || '').trim() : '';
    const repartidorVal = repartidorIdx >= 0 ? (fields[repartidorIdx] || '').trim().toUpperCase() : '';
    if (!nameVal || !repartidorVal) continue;

    clients.push({
      order: i,
      name: nameVal,
      repartidor: repartidorVal,
      coords: coordsIdx >= 0 ? (fields[coordsIdx] || '').trim() : '',
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
        if (!response.ok) return { startCoords, stops };
        const text = await response.text();
        const parsedRows = parseCsvContent(text);
        if (parsedRows.length < 2) return { startCoords, stops };

        const header = parsedRows[0].map(h => h.toUpperCase().trim());
        const ordenIdx = header.findIndex(h => h.includes('ORDEN'));
        const nombreIdx = header.findIndex(h => h.includes('NOMBRE'));
        const coordsIdx = header.findIndex(h => h === 'UBICACIÓN' || h === 'UBICACION' || h === 'COORDENADAS' || h.includes('COORD'));

        if (ordenIdx === -1 || nombreIdx === -1) return { startCoords, stops };

        for (let i = 1; i < parsedRows.length; i++) {
            const fields = parsedRows[i];
            const ordenVal = fields[ordenIdx];
            const orden = parseInt(ordenVal || '', 10);
            if (isNaN(orden)) continue;

            const nombre = (fields[nombreIdx] || '').trim();
            const coords = coordsIdx >= 0 ? (fields[coordsIdx] || '').trim() : '';

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
    } catch (e) {
        console.error("Error parsing driver sheet:", e.message);
    }
    return { startCoords, stops };
}

async function run() {
  try {
    console.log('Fetching drivers from database...');
    const { data: dbDrivers, error: driversError } = await supabase
        .from('drivers')
        .select('id, name, morning_sheet_url, evening_sheet_url');
    if (driversError) throw driversError;
    
    console.log(`Fetched ${dbDrivers.length} drivers.`);
    
    console.log('Fetching Morning Master Clients...');
    const morningClients = await fetchMasterSheetClients(MORNING_SHEET_ID, MORNING_GID);
    console.log(`Parsed ${morningClients.length} morning clients.`);

    console.log('Fetching Evening Master Clients...');
    const eveningClients = await fetchMasterSheetClients(EVENING_SHEET_ID, EVENING_GID);
    console.log(`Parsed ${eveningClients.length} evening clients.`);
    
    // Group morning clients by driver
    const morningMap = {};
    morningClients.forEach(c => {
      if (!morningMap[c.repartidor]) morningMap[c.repartidor] = [];
      morningMap[c.repartidor].push(c);
    });
    
    console.log('Morning drivers in sheet:', Object.keys(morningMap));
    
    for (const [driverName, clients] of Object.entries(morningMap)) {
      const dbDriver = dbDrivers.find(d => d.name.toUpperCase().trim() === driverName.toUpperCase().trim());
      const driverSheetUrl = dbDriver?.morning_sheet_url || '';
      console.log(`Driver "${driverName}" sheet URL: ${driverSheetUrl ? 'Defined' : 'Empty'}`);
      if (driverSheetUrl) {
        const { startCoords, stops } = await fetchDriverIndividualRoute(driverSheetUrl);
        console.log(`Driver "${driverName}" stops parsed: ${stops.length}, startCoords: ${startCoords}`);
      }
    }
    
    console.log('Simulation complete!');
  } catch (err) {
    console.error('Simulation failed:', err);
  }
}

run();
