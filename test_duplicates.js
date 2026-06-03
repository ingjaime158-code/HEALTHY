import fs from 'fs';

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

async function testDuplicates() {
    const config = SHEET_CONFIGS.Vespertina;
    
    // Active
    const activeUrl = `https://docs.google.com/spreadsheets/d/${config.sheetId}/export?format=csv&gid=${config.activeGid}&tcb=${Date.now()}`;
    const activeRes = await fetch(activeUrl);
    const activeCsv = await activeRes.text();
    const activeClients = parseSheetClientsCsv(activeCsv, true);
    
    // Inactive
    const inactiveClients = [];
    for (const gid of config.inactiveGids) {
        const url = `https://docs.google.com/spreadsheets/d/${config.sheetId}/export?format=csv&gid=${gid}&tcb=${Date.now()}`;
        const res = await fetch(url);
        const csv = await res.text();
        inactiveClients.push(...parseSheetClientsCsv(csv, false));
    }
    
    console.log(`Active sheet clients: ${activeClients.length}`);
    console.log(`Inactive sheet clients: ${inactiveClients.length}`);
    
    const normalizeName = (name) => {
        if (!name) return '';
        return name.toUpperCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
    };
    
    const activeNames = new Set(activeClients.map(c => normalizeName(c.name)));
    const inactiveNames = new Set(inactiveClients.map(c => normalizeName(c.name)));
    
    let overlapCount = 0;
    const overlaps = [];
    for (const name of activeNames) {
        if (inactiveNames.has(name)) {
            overlapCount++;
            overlaps.push(name);
        }
    }
    
    console.log(`Overlapping names (in both active and inactive sheets): ${overlapCount}`);
    if (overlapCount > 0) {
        console.log('Sample overlaps:', overlaps.slice(0, 10));
    }
}

testDuplicates();
