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

async function testSync() {
    const config = SHEET_CONFIGS.Vespertina;
    const url = `https://docs.google.com/spreadsheets/d/${config.sheetId}/export?format=csv&gid=${config.activeGid}&tcb=${Date.now()}`;
    
    console.log('Downloading spreadsheet...');
    const res = await fetch(url);
    const csvText = await res.text();
    const sheetClients = parseSheetClientsCsv(csvText, true);
    
    console.log(`Spreadsheet has ${sheetClients.length} active clients.`);
    
    const { data: dbClients, error } = await supabase.from('businesses').select('*');
    if (error) {
        console.error('Error reading DB:', error.message);
        return;
    }
    
    console.log(`Database has ${dbClients.length} total clients.`);
    
    const normalizeName = (name) => {
        if (!name) return '';
        return name.toUpperCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
    };

    let matched = 0;
    let unmatched = 0;
    
    const matchedList = [];
    const unmatchedList = [];
    
    for (const sc of sheetClients) {
        const normName = normalizeName(sc.name);
        const dbMatch = dbClients.find(dbc => normalizeName(dbc.name) === normName);
        
        if (dbMatch) {
            matched++;
            let isActive = true;
            if (dbMatch.email && dbMatch.email.startsWith('{') && dbMatch.email.endsWith('}')) {
                try {
                    const parsed = JSON.parse(dbMatch.email);
                    isActive = parsed.isActive !== false;
                } catch (e) {}
            }
            matchedList.push({ name: sc.name, dbId: dbMatch.id, dbRoute: dbMatch.route_type, dbIsActive: isActive });
        } else {
            unmatched++;
            unmatchedList.push(sc.name);
        }
    }
    
    console.log(`\nMatch statistics for Google Sheet active clients:`);
    console.log(`Matched with DB client: ${matched}`);
    console.log(`Unmatched with DB client: ${unmatched}`);
    
    console.log('\nSample of matched clients and their status in DB:');
    console.log(matchedList.slice(0, 10));
    
    console.log('\nSample of unmatched clients (not in DB at all):');
    console.log(unmatchedList.slice(0, 10));
}

testSync();
