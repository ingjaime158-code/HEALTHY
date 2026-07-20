import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envPath = './.env';
let envContent = '';
try {
    envContent = fs.readFileSync(envPath, 'utf8');
} catch (err) {
    console.error(err.message);
    process.exit(1);
}

const env = {};
envContent.split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

const SHEET_CONFIG = {
    sheetId: '1fWjuO_bGy4cvO0-Ru-u2lbnJcD8ZJFg3ovTaD7kIDzE',
    activeGid: '1075208342',
    inactiveGids: ['111911838', '943525495']
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
    const driverIdx = header.findIndex(h => h.includes('REPARTIDOR') || h.includes('REP') || h.includes('DRIVER'));

    const clients = [];

    for (let i = 1; i < parsedRows.length; i++) {
        const fields = parsedRows[i];
        if (fields.length <= nameIdx) continue;

        const name = (fields[nameIdx] || '').trim();
        if (!name) continue;
        if (name.toUpperCase().includes('PUNTO DE INICIO')) continue;

        const phone = phoneIdx >= 0 ? (fields[phoneIdx] || '').trim() : '';
        const address = addressIdx >= 0 ? (fields[addressIdx] || '').trim() : '';
        const driver = driverIdx >= 0 ? (fields[driverIdx] || '').trim().toUpperCase() : 'SIN ASIGNAR';

        clients.push({
            name,
            phone,
            address,
            driver,
            isActive
        });
    }

    return clients;
}

function normalizeName(name) {
    if (!name) return '';
    return name.toString().toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z]/g, '') // Solo letras
      .trim();
}

async function compare() {
    console.log('📥 1. Descargando clientes ACTIVOS de Google Sheets (Matutina)...');
    const activeUrl = `https://docs.google.com/spreadsheets/d/${SHEET_CONFIG.sheetId}/export?format=csv&gid=${SHEET_CONFIG.activeGid}&tcb=${Date.now()}`;
    const activeRes = await fetch(activeUrl);
    if (!activeRes.ok) {
        console.error('No se pudo descargar de Google Sheets');
        return;
    }
    const activeCsv = await activeRes.ok ? await activeRes.text() : '';
    const sheetActiveClients = parseSheetClientsCsv(activeCsv, true);
    
    console.log(`📊 Clientes activos en el Excel de Matutina: ${sheetActiveClients.length}`);
    
    console.log('\n📥 2. Descargando clientes de la base de datos (Supabase, Matutina)...');
    const { data: dbClients, error } = await supabase.from('businesses').select('*').eq('route_type', 'Matutina');
    if (error) {
        console.error(error.message);
        return;
    }
    
    const dbActiveClients = [];
    dbClients.forEach(c => {
        let isActive = true;
        try {
            const parsed = JSON.parse(c.email);
            isActive = parsed.isActive !== false;
        } catch(e){}
        if (isActive) dbActiveClients.push(c);
    });
    
    console.log(`📊 Clientes activos en Supabase para Matutina: ${dbActiveClients.length}`);
    
    const sheetActiveNames = new Set(sheetActiveClients.map(c => normalizeName(c.name)));
    
    console.log('\n🔍 --- COMPARANDO ---');
    console.log('Clientes que están ACTIVOS en la BD de Supabase pero NO están activos (o no existen) en el Excel actual:');
    
    let diffCount = 0;
    dbActiveClients.forEach(dbc => {
        let dbConfig = {};
        try {
            dbConfig = JSON.parse(dbc.email);
        } catch(e){}
        if (dbConfig.isManual) {
            console.log(`ℹ️ Cliente manual: "${dbc.name}" (ID: ${dbc.id}) [Excluido de la comparación]`);
            return;
        }

        const normDbName = normalizeName(dbc.name);
        // Buscamos si existe coincidencia exacta o difusa en el set de nombres activos del Excel
        let matchFound = false;
        for (const sn of sheetActiveNames) {
            if (sn === normDbName || sn.includes(normDbName) || normDbName.includes(sn)) {
                matchFound = true;
                break;
            }
        }
        
        if (!matchFound) {
            diffCount++;
            console.log(`\n❌ [${diffCount}] Cliente sobrante en Supabase:`);
            console.log(`   ID: ${dbc.id}`);
            console.log(`   Nombre: "${dbc.name}"`);
            console.log(`   Dirección: "${dbc.location}"`);
            console.log(`   Chofer: ${dbConfig.driver}`);
        }
    });
    
    console.log(`\nTotal de clientes sobrantes en la BD: ${diffCount}`);
}

compare();
