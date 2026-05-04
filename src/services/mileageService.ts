import axios from 'axios';

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

export const fetchMileageData = async (monthName: string): Promise<DaySummary[]> => {
    const gid = GIDS[monthName];
    
    // LOG DE DEPURACIÓN: Esto aparecerá en la consola del navegador (F12)
    console.log(`[MileageService] Solicitando mes: ${monthName}, GID: ${gid || 'NO ENCONTRADO'}`);

    if (!gid) {
        console.error(`[MileageService] Error: No hay un GID configurado para el mes "${monthName}". Revisa el archivo mileageService.ts`);
        throw new Error(`Mes no encontrado: ${monthName}`);
    }

    // Añadimos un timestamp para evitar que el navegador cachee datos de meses anteriores
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}&tcb=${Date.now()}`;
    
    console.log(`[MileageService] URL Final: ${url}`);

    const response = await axios.get(url);
    const csvData = response.data;

    return parseMileageCsv(csvData);
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
            currentDay = {
                date: parts[0],
                records: []
            };
            parsingHeader = true;
            continue;
        }

        if (firstPart === 'REPARTIDOR' || firstPart.includes('KM TOTALES')) {
            parsingHeader = false;
            continue;
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
