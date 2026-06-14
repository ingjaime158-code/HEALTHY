import axios from 'axios';
import { supabase } from './supabaseClient';

export interface MileageRecord {
    date: string;
    driver: string;
    totalKm: number;
    routeKm: number;
    customers: number;
}

export interface DaySummary {
    date: string;
    records: MileageRecord[];
}

const SHEET_ID = '1w4fXIwWhpstY8A2usROVpMNh7WAbUXv7cOgKcltn-Tk';
const GIDS: { [key: string]: string } = {
    'Enero': '1003618615',
    'Febrero': '37267146',
    'Marzo': '2113545175',
    'Abril': '1900833549',
    'Mayo': '1530282506'
};

const MONTH_MAP: { [key: string]: string } = {
    'Enero': '-01-',
    'Febrero': '-02-',
    'Marzo': '-03-',
    'Abril': '-04-',
    'Mayo': '-05-',
    'Junio': '-06-',
    'Julio': '-07-',
    'Agosto': '-08-',
    'Septiembre': '-09-',
    'Octubre': '-10-',
    'Noviembre': '-11-',
    'Diciembre': '-12-'
};

const parseDateString = (dateStr: string) => {
    const parts = dateStr.split(' ');
    if (parts.length < 2) return new Date(0);
    const dateParts = parts[1].split('-');
    if (dateParts.length < 3) return new Date(0);
    const d = parseInt(dateParts[0], 10);
    const m = parseInt(dateParts[1], 10);
    const y = parseInt(dateParts[2], 10);
    return new Date(2000 + y, m - 1, d, parts[0] === 'RV' ? 12 : 8);
};

export const saveMileageRecords = async (records: MileageRecord[]): Promise<void> => {
    if (!records || records.length === 0) return;

    console.log(`[MileageService] Guardando ${records.length} registros en Supabase...`);

    const dbRecords = records.map(r => ({
        date: r.date,
        driver: r.driver,
        total_km: r.totalKm,
        route_km: r.routeKm,
        customers: r.customers
    }));

    const { error } = await supabase
        .from('mileage_records')
        .upsert(dbRecords, { onConflict: 'date,driver' });

    if (error) {
        console.error('[MileageService] Error guardando kilometraje en Supabase:', error);
        throw error;
    }

    console.log('[MileageService] Registros guardados exitosamente.');
};

export const fetchMileageData = async (monthName: string): Promise<DaySummary[]> => {
    console.log(`[MileageService] Cargando datos para el mes: ${monthName}`);

    // 1. Intentar cargar datos desde Google Sheets (si el mes tiene un GID)
    const gid = GIDS[monthName];
    let sheetSummaries: DaySummary[] = [];

    if (gid) {
        try {
            const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&tcb=${Date.now()}`;
            console.log(`[MileageService] Consultando Google Sheets: ${url}`);
            const response = await axios.get(url);
            sheetSummaries = parseMileageCsv(response.data);
            console.log(`[MileageService] Cargados ${sheetSummaries.length} días desde Google Sheets.`);
        } catch (err) {
            console.error(`[MileageService] Error al leer Google Sheets para ${monthName}:`, err);
        }
    } else {
        console.log(`[MileageService] No hay GID configurado para ${monthName}. Se omitirá Google Sheets.`);
    }

    // 2. Intentar cargar datos desde Supabase
    const monthPattern = MONTH_MAP[monthName];
    let dbSummaries: DaySummary[] = [];

    if (monthPattern) {
        try {
            console.log(`[MileageService] Consultando Supabase con patrón de fecha: %${monthPattern}%`);
            const { data: dbData, error: dbError } = await supabase
                .from('mileage_records')
                .select('*')
                .like('date', `%${monthPattern}%`);

            if (dbError) {
                console.error('[MileageService] Error consultando Supabase:', dbError.message);
            } else if (dbData && dbData.length > 0) {
                console.log(`[MileageService] Cargados ${dbData.length} registros desde Supabase.`);
                
                // Agrupar los registros por fecha
                const groups: { [key: string]: MileageRecord[] } = {};
                dbData.forEach(row => {
                    if (!groups[row.date]) {
                        groups[row.date] = [];
                    }
                    groups[row.date].push({
                        date: row.date,
                        driver: row.driver,
                        totalKm: Number(row.total_km),
                        routeKm: Number(row.route_km),
                        customers: Number(row.customers)
                    });
                });

                dbSummaries = Object.keys(groups).map(date => ({
                    date,
                    records: groups[date]
                }));
            } else {
                console.log('[MileageService] No se encontraron registros en Supabase para este mes.');
            }
        } catch (err) {
            console.error('[MileageService] Error inesperado consultando Supabase:', err);
        }
    }

    // 3. Mezclar ambas fuentes priorizando Supabase en caso de duplicidad (date, driver)
    const mergedMap: { [date: string]: { [driver: string]: MileageRecord } } = {};

    // Primero agregamos los registros de Google Sheets
    sheetSummaries.forEach(day => {
        if (!mergedMap[day.date]) {
            mergedMap[day.date] = {};
        }
        day.records.forEach(rec => {
            mergedMap[day.date][rec.driver] = rec;
        });
    });

    // Luego sobrescribimos/agregamos con Supabase
    dbSummaries.forEach(day => {
        if (!mergedMap[day.date]) {
            mergedMap[day.date] = {};
        }
        day.records.forEach(rec => {
            mergedMap[day.date][rec.driver] = rec;
        });
    });

    // Convertir de nuevo al formato DaySummary[]
    const finalSummaries: DaySummary[] = Object.keys(mergedMap).map(date => {
        const records = Object.values(mergedMap[date]);
        return { date, records };
    });

    // Ordenar cronológicamente usando parseDateString
    finalSummaries.sort((a, b) => parseDateString(a.date).getTime() - parseDateString(b.date).getTime());

    console.log(`[MileageService] Total de días unificados y ordenados: ${finalSummaries.length}`);
    return finalSummaries;
};

const parseMileageCsv = (csv: string): DaySummary[] => {
    const lines = csv.split('\n');
    const summaries: DaySummary[] = [];
    let currentDay: DaySummary | null = null;
    let parsingHeader = false;

    for (let i = 0; i < lines.length; i++) {
        // Limpiamos la línea de comillas dobles que pone Google y espacios extra
        const rawLine = lines[i].trim();
        if (!rawLine) continue;

        // Dividir por coma pero manejar posibles comas dentro de comillas (aunque aquí es simple)
        // Primero limpiamos comillas globales de la línea para simplificar
        const cleanLine = rawLine.replace(/"/g, '');
        
        if (cleanLine.replace(/,/g, '').trim() === '') {
            if (currentDay && currentDay.records.length > 0) {
                summaries.push(currentDay);
                currentDay = null;
            }
            continue;
        }

        const parts = cleanLine.split(',').map(p => p.trim());

        // Buscamos el encabezado de fecha (RV o RM seguido de fecha)
        const firstPart = parts[0].toUpperCase();
        if ((firstPart.startsWith('RV') || firstPart.startsWith('RM')) && firstPart.includes('-')) {
            if (currentDay && currentDay.records.length > 0) {
                summaries.push(currentDay);
            }
            
            // Si por alguna razón gviz fusionó el header: "RV 03-05-26 REPARTIDOR"
            const dateOnly = parts[0].replace(/ REPARTIDOR/gi, '').trim();
            currentDay = {
                date: dateOnly,
                records: []
            };
            parsingHeader = true;
            continue;
        }

        if (firstPart === 'REPARTIDOR' || firstPart.includes('KM TOTALES')) {
            parsingHeader = false;
            continue;
        }

        // Si ya hay currentDay pero seguimos en modo "parsingHeader", y encontramos una fila
        // que parece ser datos válidos (tiene un número en la segunda columna), apagamos parsingHeader solos
        if (currentDay && parts.length >= 2 && parts[0] !== '') {
            const totalKm = parseFloat(parts[1]);
            if (!isNaN(totalKm)) {
                parsingHeader = false;
            }
        }

        if (currentDay && !parsingHeader && parts.length >= 2 && parts[0] !== '') {
            // Validamos que la segunda columna sea un número para evitar filas de basura
            const totalKm = parseFloat(parts[1]);
            if (isNaN(totalKm)) continue;

            const routeKm = parseFloat(parts[2]) || 0;
            const customers = parseInt(parts[3]) || 0;

            currentDay.records.push({
                date: currentDay.date,
                driver: parts[0],
                totalKm,
                routeKm,
                customers
            });
        }
    }

    if (currentDay && currentDay.records.length > 0) {
        summaries.push(currentDay);
    }

    return summaries;
};
