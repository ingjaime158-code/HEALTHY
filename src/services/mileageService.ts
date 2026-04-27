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
    'Febrero': '1478198774',
    'Marzo': '1530948509',
    'Abril': '730074128'
};

export const fetchMileageData = async (monthName: string): Promise<DaySummary[]> => {
    const gid = GIDS[monthName];
    if (!gid) throw new Error(`Mes no encontrado: ${monthName}`);

    // Usamos el endpoint de visualización que es más estable para peticiones web públicas
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
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
        const line = lines[i].trim();
        if (!line || line.replace(/,/g, '').trim() === '') {
            if (currentDay && currentDay.records.length > 0) {
                summaries.push(currentDay);
                currentDay = null;
            }
            continue;
        }

        const parts = line.split(',').map(p => p.trim());

        // Check if it's a date header (e.g., RV 04-01-26 or RM 05-01-26)
        if ((parts[0].startsWith('RV') || parts[0].startsWith('RM')) && parts[0].includes('-')) {
            if (currentDay && currentDay.records.length > 0) {
                summaries.push(currentDay);
            }
            currentDay = {
                date: parts[0],
                records: []
            };
            parsingHeader = true; // Next line should be headers
            continue;
        }

        if (parts[0] === 'REPARTIDOR') {
            parsingHeader = false;
            continue;
        }

        if (currentDay && !parsingHeader && parts.length >= 4 && parts[0] !== '') {
            const totalKm = parseFloat(parts[1]) || 0;
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
