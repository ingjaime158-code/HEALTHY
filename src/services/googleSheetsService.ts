/**
 * Service to push client data to Google Sheets via Webhook (Google Apps Script)
 */
import { supabase } from './supabaseClient';

const GAS_URLS = {
    Matutina: import.meta.env.VITE_GAS_MATUTINA_URL || 'https://script.google.com/macros/s/AKfycbxPxN0wqRT7Y5z9D8VVOuXmPaN9LP0swpVKB9YqLTXWYj3Mc7Qj2MHNVc9KiGnIJIyQ/exec',
    Vespertina: import.meta.env.VITE_GAS_VESPERTINA_URL || 'https://script.google.com/macros/s/AKfycbwlB2MfXAj54g4_78CUzsgtqnaTuFKYuPWYx_fVWHSQeNF5HWElprSg-6wshKcfM6M/exec'
};

const GAS_WEBHOOK_SECRET = import.meta.env.VITE_GAS_WEBHOOK_SECRET || 'hd_wh_9f8a7c6b5d4e3f2a1b0c9d8e7f6a5b4c';
const USE_SHEETS_EDGE_PROXY = import.meta.env.VITE_USE_SHEETS_EDGE_PROXY === 'true';

async function sendToGoogleAppsScript(routeType: 'Matutina' | 'Vespertina', payload: Record<string, any>): Promise<boolean> {
    const url = GAS_URLS[routeType];
    if (!url) {
        console.error('No GAS URL found for route type:', routeType);
        return false;
    }

    const payloadWithAuth = GAS_WEBHOOK_SECRET
        ? { ...payload, token: GAS_WEBHOOK_SECRET }
        : payload;

    // 1. Si el proxy en Supabase Edge Functions está habilitado, enviar de forma autenticada desde servidor
    if (USE_SHEETS_EDGE_PROXY) {
        try {
            const { data, error } = await supabase.functions.invoke('sheets-webhook', {
                body: { routeType, payload: payloadWithAuth }
            });
            if (!error && data?.ok) {
                return true;
            }
            console.warn('[GoogleSheetsService] Edge proxy fallback to direct GAS call:', error?.message || data);
        } catch (proxyErr) {
            console.warn('[GoogleSheetsService] Edge proxy unavailable, using direct GAS call:', proxyErr);
        }
    }

    // 2. Llamada directa a Google Apps Script (con token si VITE_GAS_WEBHOOK_SECRET está definido)
    await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain'
        },
        body: JSON.stringify(payloadWithAuth)
    });

    return true;
}

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
    tiempos?: number,
    accessCode?: string,
    accessQr?: string
}) => {
    const url = GAS_URLS[routeType];
    if (!url) {
        console.error('No GAS URL found for route type:', routeType);
        return false;
    }

    try {
        const finalPlanType = data.planType || 'HEALTHY';
        const finalBags = data.bags !== undefined && data.bags > 0 ? data.bags : 1;
        const finalTiempos = data.tiempos !== undefined && data.tiempos > 0 ? data.tiempos : 1;
        const finalExclusions = data.exclusions || 'Ninguna';
        const finalDriver = (data.driver && data.driver !== 'SIN ASIGNAR') ? data.driver : '';

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
            'PLAN ALIMENTICIO': finalPlanType,
            'plan alimenticio': finalPlanType,
            'planAlimenticio': finalPlanType,
            'plan_alimenticio': finalPlanType,
            'plan': finalPlanType,
            'PLAN': finalPlanType,
            'planType': finalPlanType,
            'plan_type': finalPlanType,
            'PLAN TYPE': finalPlanType,
            'plan type': finalPlanType,

            // Bags variations
            'BOLSAS': finalBags,
            'bolsas': finalBags,
            'CANTIDAD DE BOLSAS': finalBags,
            'cantidad de bolsas': finalBags,
            'cantidadBolsas': finalBags,
            'cantidad_de_bolsas': finalBags,

            // Tiempos / Viandas variations
            'TIEMPOS': finalTiempos,
            'tiempos': finalTiempos,
            'VIANDAS': finalTiempos,
            'viandas': finalTiempos,
            'CANTIDAD DE VIANDAS': finalTiempos,

            // Active / Status variations
            'ESTADO': data.isActive ? '1' : '0',
            'ESTATUS': data.isActive ? '1' : '0',
            'estado': data.isActive ? '1' : '0',
            'estatus': data.isActive ? '1' : '0',
            'activo': data.isActive ? '1' : '0',
            'ACTIVO': data.isActive ? '1' : '0',

            // Access Code / Gate PIN / Privada variations
            'ACCESO': data.accessCode || '',
            'acceso': data.accessCode || '',
            'CÓDIGO DE ACCESO': data.accessCode || '',
            'código de acceso': data.accessCode || '',
            'CODIGO DE ACCESO': data.accessCode || '',
            'codigo de acceso': data.accessCode || '',
            'CODIGO ACCESO': data.accessCode || '',
            'codigo acceso': data.accessCode || '',
            'CASETA': data.accessCode || '',
            'caseta': data.accessCode || '',
            'PIN': data.accessCode || '',
            'pin': data.accessCode || '',
            'PRIVADA': data.accessCode || '',
            'privada': data.accessCode || '',
            'PORTON': data.accessCode || '',
            'porton': data.accessCode || '',
            'accessCode': data.accessCode || '',
            'access_code': data.accessCode || '',

            // QR Code variations
            'QR': data.accessQr || '',
            'qr': data.accessQr || '',
            'CÓDIGO QR': data.accessQr || '',
            'código qr': data.accessQr || '',
            'CODIGO QR': data.accessQr || '',
            'codigo qr': data.accessQr || '',
            'accessQr': data.accessQr || '',
            'access_qr': data.accessQr || '',

            // Other fields variations
            'exclusiones': finalExclusions,
            'EXCLUSIONES': finalExclusions,
            'repartidor': finalDriver,
            'REPARTIDOR': finalDriver,
            'siglas': data.siglas || 'C',
            'SIGLAS': data.siglas || 'C'
        };

        await sendToGoogleAppsScript(routeType, enrichedPayload);

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

    // 1. Fetch active clients (MANDATORY: must succeed to prevent accidental mass deactivation)
    console.log(`[GoogleSheetsService] Fetching active clients for ${routeType}...`);
    const activeUrl = `https://docs.google.com/spreadsheets/d/${config.sheetId}/export?format=csv&gid=${config.activeGid}&tcb=${Date.now()}`;
    let activeRes: Response;
    try {
        activeRes = await fetch(activeUrl);
    } catch (e: any) {
        console.error('[GoogleSheetsService] Network error fetching active sheet:', e);
        throw new Error(`No se pudo descargar la pestaña de clientes activos (${routeType}): ${e?.message || 'Error de red'}`);
    }

    if (!activeRes.ok) {
        console.error(`[GoogleSheetsService] Failed to fetch active clients. Status: ${activeRes.status}`);
        throw new Error(`Google Sheets rechazó la descarga de la pestaña activa (${routeType}, HTTP ${activeRes.status}). Sincronización abortada por seguridad.`);
    }

    const activeCsvText = await activeRes.text();
    const activeClients = parseSheetClientsCsv(activeCsvText, true, true);

    activeClients.forEach(c => {
        const norm = normalizeName(c.name);
        if (norm) {
            parsedNamesSet.add(norm);
            allClients.push(c);
        }
    });
    console.log(`[GoogleSheetsService] Parsed ${activeClients.length} active clients.`);

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
function parseSheetClientsCsv(csvText: string, isActive: boolean, strictHeader = false): RawSheetClient[] {
    const parsedRows = parseCsvContent(csvText);
    if (parsedRows.length < 2) {
        if (strictHeader && parsedRows.length === 0) {
            throw new Error('La pestaña activa de Google Sheets devolvió un documento vacío.');
        }
        return [];
    }

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
        if (strictHeader) {
            throw new Error('No se encontró la columna NOMBRE o CLIENTE en la pestaña activa de Google Sheets.');
        }
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
        return await sendToGoogleAppsScript(routeType, {
            action: 'distribute_routes',
            distributions
        });
    } catch (error) {
        console.error('[GoogleSheetsService] Error distributing routes to Google Sheets:', error);
        return false;
    }
};



