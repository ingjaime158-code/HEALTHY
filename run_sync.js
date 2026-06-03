import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load from .env
const envPath = 'I:/APLICACIONES/PROYECTO HEALTHY DREAMS/frontend/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

const SHEET_CONFIGS = {
    Matutina: {
        sheetId: '1fWjuO_bGy4cvO0-Ru-u2lbnJcD8ZJFg3ovTaD7kIDzE',
        activeGid: '1075208342',
        inactiveGids: ['111911838', '943525495']
    },
    Vespertina: {
        sheetId: '1y7V-6nwmsJv_bY38PzjFhIFWaUPu8EW4IvQD23T008U',
        activeGid: '2039339913',
        inactiveGids: ['177344225']
    }
};

const PACKAGE_SIGLAS = {
  'Comida': 'C',
  'Comida + Cena': 'C+Ce',
  'Desayuno + Comida': 'D+C',
  'Desayuno + Comida + Cena': 'D+C+C',
  'Desayuno + Cena': 'D+Ce',
  'Desayuno': 'De',
  'Cena': 'Ce'
};

function parseCsvContent(text) {
    const result = [];
    let currentRow = [];
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

function parseSheetClientsCsv(csvText, isActive) {
    const parsedRows = parseCsvContent(csvText);
    if (parsedRows.length < 2) return [];

    const header = parsedRows[0].map(h => 
        h.toUpperCase()
         .normalize("NFD")
         .replace(/[\u0300-\u036f]/g, "")
         .replace(/[^\w\s]/gi, '')
         .replace(/\s+/g, ' ')
         .trim()
    );

    const nameIdx = header.findIndex(h => h.includes('NOMBRE'));
    const phoneIdx = header.findIndex(h => h.includes('TELEFONO') || h.includes('TELÉFONO') || h.includes('PHONE'));
    const addressIdx = header.findIndex(h => h.includes('DIRECCI') || h.includes('DIRECCION') || h.includes('ADDRESS'));
    const linkIdx = header.findIndex(h => h.includes('LINK') || h.includes('ENLACE'));
    const coordsIdx = header.findIndex(h => h === 'UBICACION' || h === 'UBICACIÓN' || h === 'UB' || h === 'COORDENADAS');
    const driverIdx = header.findIndex(h => h.includes('REPARTIDOR') || h.includes('REP') || h.includes('DRIVER'));
    const planIdx = header.findIndex(h => h.includes('PLAN ALIMENTICIO') || h.includes('PLAN'));
    const tiemposIdx = header.findIndex(h => h.includes('TIEMPOS') || h.includes('MEALS'));

    const clients = [];

    for (let i = 1; i < parsedRows.length; i++) {
        const fields = parsedRows[i];
        if (fields.length <= nameIdx) continue;

        const name = (fields[nameIdx] || '').trim();
        if (!name) continue;

        if (name.toUpperCase().includes('PUNTO DE INICIO')) continue;

        const phone = phoneIdx >= 0 ? (fields[phoneIdx] || '').trim() : '';
        const address = addressIdx >= 0 ? (fields[addressIdx] || '').trim() : '';
        const locationLink = linkIdx >= 0 ? (fields[linkIdx] || '').trim() : '';
        const coords = coordsIdx >= 0 ? (fields[coordsIdx] || '').trim() : '';
        const driver = driverIdx >= 0 ? (fields[driverIdx] || '').trim().toUpperCase() : 'SIN ASIGNAR';
        const planType = planIdx >= 0 ? (fields[planIdx] || '').trim().toUpperCase() : 'HEALTHY';
        const tiempos = tiemposIdx >= 0 ? (parseInt(fields[tiemposIdx] || '1', 10) || 1) : 1;

        clients.push({
            name,
            phone,
            address,
            locationLink,
            coords,
            driver: driver || 'SIN ASIGNAR',
            planType: planType || 'HEALTHY',
            tiempos,
            isActive
        });
    }

    return clients;
}

const fetchClientsFromGoogleSheet = async (routeType) => {
    const config = SHEET_CONFIGS[routeType];
    if (!config) {
        console.error('No sheet config found for route type:', routeType);
        return [];
    }

    const allClients = [];
    const parsedNamesSet = new Set();

    const normalizeName = (name) => {
        if (!name) return '';
        return name.toUpperCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
    };

    // 1. Fetch active clients
    try {
        console.log(`[GoogleSheetsService] Fetching active clients for ${routeType}...`);
        const url = `https://docs.google.com/spreadsheets/d/${config.sheetId}/export?format=csv&gid=${config.activeGid}&tcb=${Date.now()}`;
        const res = await fetch(url);
        if (res.ok) {
            const csvText = await res.text();
            const activeClients = parseSheetClientsCsv(csvText, true);
            
            activeClients.forEach(c => {
                const norm = normalizeName(c.name);
                if (norm) {
                    parsedNamesSet.add(norm);
                    allClients.push(c);
                }
            });
            console.log(`[GoogleSheetsService] Parsed ${activeClients.length} active clients.`);
        } else {
            console.error(`[GoogleSheetsService] Failed to fetch active clients. Status: ${res.status}`);
        }
    } catch (e) {
        console.error('[GoogleSheetsService] Error fetching active sheet:', e);
    }

    // 2. Fetch inactive clients
    for (const inactiveGid of config.inactiveGids) {
        try {
            console.log(`[GoogleSheetsService] Fetching inactive clients for ${routeType} (GID: ${inactiveGid})...`);
            const url = `https://docs.google.com/spreadsheets/d/${config.sheetId}/export?format=csv&gid=${inactiveGid}&tcb=${Date.now()}`;
            const res = await fetch(url);
            if (res.ok) {
                const csvText = await res.text();
                const inactiveClients = parseSheetClientsCsv(csvText, false);
                
                let uniqueCount = 0;
                inactiveClients.forEach(c => {
                    const norm = normalizeName(c.name);
                    if (norm && !parsedNamesSet.has(norm)) {
                        parsedNamesSet.add(norm);
                        allClients.push(c);
                        uniqueCount++;
                    }
                });
                console.log(`[GoogleSheetsService] Parsed ${uniqueCount} unique inactive clients from GID ${inactiveGid} (excluded ${inactiveClients.length - uniqueCount} duplicates).`);
            } else {
                console.error(`[GoogleSheetsService] Failed to fetch inactive clients GID ${inactiveGid}. Status: ${res.status}`);
            }
        } catch (e) {
            console.error(`[GoogleSheetsService] Error fetching inactive sheet GID ${inactiveGid}:`, e);
        }
    }

    return allClients;
};

async function runSyncForRoute(routeType) {
    console.log(`\n=== COMENZANDO SINCRONIZACIÓN PARA RUTA: ${routeType.toUpperCase()} ===`);
    const sheetClients = await fetchClientsFromGoogleSheet(routeType);
    console.log(`Clientes totales parseados y deduplicados de Google Sheet: ${sheetClients.length}`);

    // Fetch drivers and businesses
    const { data: dbDrivers, error: driversErr } = await supabase.from('drivers').select('*');
    if (driversErr) {
        console.error('Error fetching drivers:', driversErr.message);
        return;
    }
    const driverNames = dbDrivers.map(d => d.name.toUpperCase().trim());

    const { data: dbClients, error: clientsErr } = await supabase.from('businesses').select('*');
    if (clientsErr) {
        console.error('Error fetching businesses:', clientsErr.message);
        return;
    }
    const activeRouteDbClients = dbClients.filter(c => c.route_type === routeType);

    const normalizeName = (name) => {
        if (!name) return '';
        return name.toUpperCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
    };

    let newCount = 0;
    let updatedCount = 0;
    let ignoredCount = 0;

    for (const sheetClient of sheetClients) {
        const normalizedSheetName = normalizeName(sheetClient.name);
        const matchedDbClient = activeRouteDbClients.find(
            c => normalizeName(c.name) === normalizedSheetName
        );

        let lat = 0;
        let lng = 0;
        if (sheetClient.coords) {
          const parts = sheetClient.coords.split(',');
          if (parts.length === 2) {
            const parsedLat = parseFloat(parts[0].trim());
            const parsedLng = parseFloat(parts[1].trim());
            if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
              lat = parsedLat;
              lng = parsedLng;
            }
          }
        }

        let finalDriver = 'SIN ASIGNAR';
        const sheetDriverUpper = sheetClient.driver.trim().toUpperCase();
        if (sheetDriverUpper) {
          const matchedDriver = driverNames.find(d => d === sheetDriverUpper || d.includes(sheetDriverUpper) || sheetDriverUpper.includes(d));
          if (matchedDriver) {
            finalDriver = matchedDriver;
          }
        }

        if (matchedDbClient) {
          let dbConfig = {
            planType: 'HEALTHY',
            plansCount: 1,
            exclusions: 'Ninguna',
            siglas: 'C',
            driver: 'SIN ASIGNAR',
            isActive: true,
            extraDishes: 0,
            tiempos: 1,
            package: 'Comida',
            plans: []
          };

          if (matchedDbClient.email && matchedDbClient.email.startsWith('{') && matchedDbClient.email.endsWith('}')) {
            try {
              dbConfig = { ...dbConfig, ...JSON.parse(matchedDbClient.email) };
            } catch (e) {}
          }

          const statusChanged = dbConfig.isActive !== sheetClient.isActive;
          const phoneChanged = (matchedDbClient.phone || '') !== sheetClient.phone;
          const addressChanged = (matchedDbClient.location || '') !== sheetClient.address;
          const linkChanged = (matchedDbClient.location_link || '') !== sheetClient.locationLink;
          const coordsChanged = Math.abs(matchedDbClient.lat - lat) > 0.0001 || Math.abs(matchedDbClient.lng - lng) > 0.0001;
          const driverChanged = dbConfig.driver !== finalDriver;
          const planChanged = dbConfig.planType !== sheetClient.planType;
          const tiemposChanged = dbConfig.tiempos !== sheetClient.tiempos;

          if (statusChanged || phoneChanged || addressChanged || linkChanged || coordsChanged || driverChanged || planChanged || tiemposChanged) {
            dbConfig.isActive = sheetClient.isActive;
            dbConfig.driver = finalDriver;
            dbConfig.planType = sheetClient.planType || dbConfig.planType;
            dbConfig.tiempos = sheetClient.tiempos || dbConfig.tiempos;
            
            if (planChanged || tiemposChanged) {
              const defaultSiglas = PACKAGE_SIGLAS[sheetClient.planType] || 'C';
              dbConfig.siglas = defaultSiglas;
              dbConfig.package = sheetClient.planType;
              dbConfig.plans = [{
                id: 'plan-1',
                planType: sheetClient.planType,
                package: sheetClient.planType,
                siglas: defaultSiglas,
                tiempos: sheetClient.tiempos
              }];
            }

            const updatedEmail = JSON.stringify(dbConfig);

            const { error: updateErr } = await supabase.from('businesses').update({
              phone: sheetClient.phone || matchedDbClient.phone,
              location: sheetClient.address || matchedDbClient.location,
              location_link: sheetClient.locationLink || matchedDbClient.location_link,
              lat: lat || matchedDbClient.lat,
              lng: lng || matchedDbClient.lng,
              email: updatedEmail
            }).eq('id', matchedDbClient.id);

            if (updateErr) {
                console.error(`Error updating client ${sheetClient.name}:`, updateErr.message);
            } else {
                updatedCount++;
            }
          } else {
              ignoredCount++;
          }
        } else {
          const defaultSiglas = PACKAGE_SIGLAS[sheetClient.planType] || 'C';
          
          const newConfig = {
            planType: sheetClient.planType,
            plansCount: 1,
            exclusions: 'Ninguna',
            siglas: defaultSiglas,
            driver: finalDriver,
            isActive: sheetClient.isActive,
            extraDishes: 0,
            tiempos: sheetClient.tiempos,
            package: sheetClient.planType,
            plans: [
              {
                id: 'plan-1',
                planType: sheetClient.planType,
                package: sheetClient.planType,
                siglas: defaultSiglas,
                tiempos: sheetClient.tiempos
              }
            ]
          };

          const newEmail = JSON.stringify(newConfig);

          const { error: insertErr } = await supabase.from('businesses').insert({
            name: sheetClient.name,
            type: 'Other',
            location: sheetClient.address,
            lat: lat,
            lng: lng,
            phone: sheetClient.phone,
            email: newEmail,
            rfc: '',
            route_type: routeType,
            location_link: sheetClient.locationLink
          });

          if (insertErr) {
              console.error(`Error inserting client ${sheetClient.name}:`, insertErr.message);
          } else {
              newCount++;
          }
        }
    }

    console.log(`Reporte Sincronización ${routeType}:`);
    console.log(`- Nuevos creados: ${newCount}`);
    console.log(`- Existentes actualizados: ${updatedCount}`);
    console.log(`- Sin cambios requeridos: ${ignoredCount}`);
}

async function run() {
    await runSyncForRoute('Vespertina');
    await runSyncForRoute('Matutina');
    
    // Check results
    console.log('\n=== RECUENTO FINAL EN LA BASE DE DATOS ===');
    const { data: businesses } = await supabase.from('businesses').select('*');
    let activeV = 0, inactiveV = 0, activeM = 0, inactiveM = 0;
    businesses.forEach(b => {
        let isActive = true;
        if (b.email && b.email.startsWith('{') && b.email.endsWith('}')) {
            try {
                isActive = JSON.parse(b.email).isActive !== false;
            } catch (e) {}
        }
        if (b.route_type === 'Vespertina') {
            if (isActive) activeV++; else inactiveV++;
        } else if (b.route_type === 'Matutina') {
            if (isActive) activeM++; else inactiveM++;
        }
    });
    console.log(`Vespertina - Activos: ${activeV}, Inactivos: ${inactiveV}`);
    console.log(`Matutina   - Activos: ${activeM}, Inactivos: ${inactiveM}`);
}

run();
