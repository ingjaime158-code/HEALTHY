/**
 * Service to push client data to Google Sheets via Webhook (Google Apps Script)
 */

const GAS_URLS = {
    Matutina: 'https://script.google.com/macros/s/AKfycbxPxN0wqRT7Y5z9D8VVOuXmPaN9LP0swpVKB9YqLTXWYj3Mc7Qj2MHNVc9KiGnIJIyQ/exec',
    Vespertina: 'https://script.google.com/macros/s/AKfycbwlB2MfXAj54g4_78CUzsgtqnaTuFKYuPWYx_fVWHSQeNF5HWElprSg-6wshKcfM6M/exec'
};

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

export interface RawSheetClient {
    name: string;
    phone: string;
    address: string;
    locationLink: string;
    coords: string;
    driver: string;
    planType: string;
    tiempos: number;
    isActive: boolean;
    exclusions?: string;
    bags?: number;
}

export const pushToGoogleSheets = async (routeType: 'Matutina' | 'Vespertina', data: {
    name: string,
    phone: string,
    address: string,
    locationLink: string,
    coords: string,
    bags?: number,
    planType?: string,
    plansCount?: number,
    exclusions?: string,
    siglas?: string,
    driver?: string,
    isActive?: boolean,
    tiempos?: number
}) => {
    const url = GAS_URLS[routeType];
    if (!url) {
        console.error('No GAS URL found for route type:', routeType);
        return false;
    }

    try {
        // Build an enriched payload with multiple key formats to guarantee 
        // automatic column mapping in Google Sheets, regardless of header casing or language.
        const enrichedPayload = {
            ...data,
            // Name variations
            'NOMBRE': data.name,
            'nombre': data.name,
            'NAME': data.name,
            'name': data.name,
            'CLIENTE': data.name,
            'cliente': data.name,

            // Phone variations
            'TELEFONO': data.phone,
            'telefono': data.phone,
            'TELÉFONO': data.phone,
            'teléfono': data.phone,
            'PHONE': data.phone,
            'phone': data.phone,

            // Address variations
            'DIRECCIÓN': data.address,
            'dirección': data.address,
            'DIRECCION': data.address,
            'direccion': data.address,
            'ADDRESS': data.address,
            'address': data.address,

            // Location Link variations
            'LINK DE UBICACIÓN': data.locationLink,
            'link de ubicación': data.locationLink,
            'LINK DE UBICACION': data.locationLink,
            'link de ubicacion': data.locationLink,
            'LINK DE MAPA': data.locationLink,
            'link de mapa': data.locationLink,
            'LINK': data.locationLink,
            'link': data.locationLink,
            'ENLACE': data.locationLink,
            'enlace': data.locationLink,
            'locationLink': data.locationLink,
            'location_link': data.locationLink,
            'MAP_LINK': data.locationLink,
            'map_link': data.locationLink,

            // Coordinates variations
            'UBICACIÓN': data.coords,
            'ubicación': data.coords,
            'UBICACION': data.coords,
            'ubicacion': data.coords,
            'COORDINATES': data.coords,
            'coordinates': data.coords,
            'COORDS': data.coords,
            'coords': data.coords,
            'COORDENADAS': data.coords,
            'coordenadas': data.coords,

            // Plan Type variations
            'PLAN ALIMENTICIO': data.planType,
            'plan alimenticio': data.planType,
            'planAlimenticio': data.planType,
            'plan_alimenticio': data.planType,
            'plan': data.planType,
            'PLAN': data.planType,
            'planType': data.planType,
            'plan_type': data.planType,
            'PLAN TYPE': data.planType,
            'plan type': data.planType,

            // Bags variations
            'BOLSAS': data.bags,
            'bolsas': data.bags,
            'CANTIDAD DE BOLSAS': data.bags,
            'cantidad de bolsas': data.bags,
            'cantidadBolsas': data.bags,
            'cantidad_de_bolsas': data.bags,

            // Tiempos / Viandas variations
            'TIEMPOS': data.tiempos,
            'tiempos': data.tiempos,
            'VIANDAS': data.tiempos,
            'viandas': data.tiempos,
            'CANTIDAD DE VIANDAS': data.tiempos,

            // Active / Status variations
            'ESTADO': data.isActive ? '1' : '0',
            'ESTATUS': data.isActive ? '1' : '0',
            'estado': data.isActive ? '1' : '0',
            'estatus': data.isActive ? '1' : '0',
            'activo': data.isActive ? '1' : '0',
            'ACTIVO': data.isActive ? '1' : '0',

            // Other fields variations
            'exclusiones': data.exclusions,
            'EXCLUSIONES': data.exclusions,
            'repartidor': data.driver,
            'REPARTIDOR': data.driver,
            'siglas': data.siglas,
            'SIGLAS': data.siglas
        };

        // We use a simple POST with text/plain to avoid CORS preflight (OPTIONS) requests
        // that Google Apps Script doesn't handle well.
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(enrichedPayload)
        });

        return true;
    } catch (error) {
        console.error('Error pushing to Google Sheets:', error);
        return false;
    }
};

/**
 * Downloads and parses active and inactive sheets from Google Sheets for the active route.
 */
export const fetchClientsFromGoogleSheet = async (routeType: 'Matutina' | 'Vespertina'): Promise<RawSheetClient[]> => {
    const config = SHEET_CONFIGS[routeType];
    if (!config) {
        console.error('No sheet config found for route type:', routeType);
        return [];
    }

    const allClients: RawSheetClient[] = [];
    const parsedNamesSet = new Set<string>();

    const normalizeName = (name: string): string => {
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

// RFC-4180 CSV parser
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

// Parses sheet rows into structured objects with canonical keys
function parseSheetClientsCsv(csvText: string, isActive: boolean): RawSheetClient[] {
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

    const nameIdx = header.findIndex(h => h.includes('NOMBRE') || h.includes('CLIENTE'));
    const phoneIdx = header.findIndex(h => h.includes('TELEFONO') || h.includes('TELÉFONO') || h.includes('PHONE'));
    const addressIdx = header.findIndex(h => h.includes('DIRECCI') || h.includes('DIRECCION') || h.includes('ADDRESS'));
    const linkIdx = header.findIndex(h => h.includes('LINK') || h.includes('ENLACE') || h.includes('MAPA'));
    const coordsIdx = header.findIndex(h => h === 'UBICACION' || h === 'UBICACIÓN' || h === 'UB' || h === 'COORDENADAS');
    const driverIdx = header.findIndex(h => h.includes('REPARTIDOR') || h.includes('REP') || h.includes('DRIVER'));
    const planIdx = header.findIndex(h => h.includes('PLAN ALIMENTICIO') || h.includes('PLAN'));
    const tiemposIdx = header.findIndex(h => h.includes('TIEMPOS') || h.includes('MEALS'));
    const exclusionsIdx = header.findIndex(h => h.includes('EXCLUSION') || h.includes('ALERGIA'));
    const bagsIdx = header.findIndex(h => h.includes('BOLSA') || h.includes('BAG'));

    if (nameIdx === -1) {
        console.warn('[GoogleSheetsService] Name column not found in sheet!');
        return [];
    }

    const clients: RawSheetClient[] = [];

    for (let i = 1; i < parsedRows.length; i++) {
        const fields = parsedRows[i];
        if (fields.length <= nameIdx) continue;

        const name = (fields[nameIdx] || '').trim();
        if (!name) continue;

        // Skip marker point of inicio rows
        if (name.toUpperCase().includes('PUNTO DE INICIO')) continue;

        const phone = phoneIdx >= 0 ? (fields[phoneIdx] || '').trim() : '';
        const address = addressIdx >= 0 ? (fields[addressIdx] || '').trim() : '';
        const rawLink = linkIdx >= 0 ? (fields[linkIdx] || '').trim() : '';
        const coords = coordsIdx >= 0 ? (fields[coordsIdx] || '').trim() : '';

        let locationLink = rawLink;
        if (!locationLink.startsWith('http') && coords) {
            const parts = coords.split(',').map(p => p.trim());
            if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
                locationLink = `https://www.google.com/maps?q=${parts[0]},${parts[1]}`;
            }
        }
        const driver = driverIdx >= 0 ? (fields[driverIdx] || '').trim().toUpperCase() : 'SIN ASIGNAR';
        const planType = planIdx >= 0 ? (fields[planIdx] || '').trim().toUpperCase() : '';
        const tiempos = tiemposIdx >= 0 ? (parseInt(fields[tiemposIdx] || '1', 10) || 1) : 1;
        const exclusions = exclusionsIdx >= 0 ? (fields[exclusionsIdx] || '').trim() : 'Ninguna';
        const bags = bagsIdx >= 0 ? (parseInt(fields[bagsIdx] || '1', 10) || 1) : 1;

        clients.push({
            name,
            phone,
            address,
            locationLink,
            coords,
            driver: driver || 'SIN ASIGNAR',
            planType: planType || '',
            tiempos,
            isActive,
            exclusions: exclusions || 'Ninguna',
            bags
        });
    }

    return clients;
}

/**
 * Distributes active client lists to each driver's individual spreadsheet
 */
export const distributeRoutesToGoogleSheets = async (
    routeType: 'Matutina' | 'Vespertina',
    distributions: Array<{
        driverName: string;
        sheetId: string;
        clients: Array<{
            name: string;
            phone: string;
            address: string;
            locationLink: string;
            planType: string;
            tiempos: number;
            exclusions: string;
        }>;
    }>
): Promise<boolean> => {
    const url = GAS_URLS[routeType];
    if (!url) {
        console.error('[GoogleSheetsService] No GAS URL found for route type:', routeType);
        return false;
    }

    try {
        console.log(`[GoogleSheetsService] Distributing active routes for ${routeType} to drivers sheets...`);
        
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors', // avoid CORS issues on GAS side
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify({
                action: 'distribute_routes',
                distributions
            })
        });

        return true;
    } catch (error) {
        console.error('[GoogleSheetsService] Error distributing routes to Google Sheets:', error);
        return false;
    }
};



