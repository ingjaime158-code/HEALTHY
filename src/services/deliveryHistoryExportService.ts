import { supabase } from './supabaseClient';

const MEXICO_TIMEZONE = 'America/Mexico_City';

const MONTH_NAMES = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
];

const WEEKDAY_NAMES: Record<number, string> = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
};

export type NormalizedRouteType = 'morning' | 'evening';

export interface RawDeliveryLogRow {
    driver_id: string | null;
    client_name: string | null;
    client_order: number | null;
    route_type: string | null;
    status: string | null;
    delivered_at: string | null;
    delivery_date: string | null;
}

export interface NormalizedDeliveryEntry {
    driverId: string;
    driverName: string;
    clientName: string;
    clientOrder: number;
    routeType: NormalizedRouteType;
    routeLabel: string;
    localDateKey: string; // YYYY-MM-DD in America/Mexico_City
    displayDate: string; // DD/MM/YYYY
    longDateLabel: string; // e.g. "Jueves 05 de Noviembre de 2026"
    year: number;
    month: number; // 1-12
    day: number; // 1-31
    dayOfWeek: number; // 0=Domingo .. 6=Sábado
    weekdayName: string;
    deliveredAtMs: number;
    formattedTime: string; // e.g. "02:35:18 p.m."
    hasExactTimestamp: boolean;
}

export interface DriverDaySummary {
    routeType: NormalizedRouteType;
    routeLabel: string;
    dayOfWeek: number;
    weekdayName: string;
    localDateKey: string;
    displayDate: string;
    longDateLabel: string;
    driverName: string;
    totalDeliveries: number;
    firstDeliveryTime: string;
    lastDeliveryTime: string;
    durationLabel: string;
    entries: NormalizedDeliveryEntry[];
}

export interface RouteDayBucket {
    id: string;
    sheetName: string;
    routeType: NormalizedRouteType;
    routeLabel: string;
    dayOfWeek: number;
    weekdayName: string;
    headerHex: string;
    accentHex: string;
    tintHex: string;
}

export const OFFICIAL_ROUTE_DAY_BUCKETS: RouteDayBucket[] = [
    {
        id: 'morning-1',
        sheetName: 'Matutina - Lunes',
        routeType: 'morning',
        routeLabel: 'Ruta Matutina',
        dayOfWeek: 1,
        weekdayName: 'Lunes',
        headerHex: 'FFB45309',
        accentHex: 'FFD97706',
        tintHex: 'FFFEF3C7',
    },
    {
        id: 'morning-4',
        sheetName: 'Matutina - Jueves',
        routeType: 'morning',
        routeLabel: 'Ruta Matutina',
        dayOfWeek: 4,
        weekdayName: 'Jueves',
        headerHex: 'FFB45309',
        accentHex: 'FFD97706',
        tintHex: 'FFFEF3C7',
    },
    {
        id: 'evening-3',
        sheetName: 'Vespertina - Miércoles',
        routeType: 'evening',
        routeLabel: 'Ruta Vespertina',
        dayOfWeek: 3,
        weekdayName: 'Miércoles',
        headerHex: 'FF3730A3',
        accentHex: 'FF4F46E5',
        tintHex: 'FFE0E7FF',
    },
    {
        id: 'evening-0',
        sheetName: 'Vespertina - Domingo',
        routeType: 'evening',
        routeLabel: 'Ruta Vespertina',
        dayOfWeek: 0,
        weekdayName: 'Domingo',
        headerHex: 'FF3730A3',
        accentHex: 'FF4F46E5',
        tintHex: 'FFE0E7FF',
    },
];

export interface DeliveryHistoryReportData {
    monthName: string;
    monthNumber: number;
    year: number;
    officialEntries: NormalizedDeliveryEntry[];
    otherDayEntries: NormalizedDeliveryEntry[];
    driverDaySummaries: DriverDaySummary[];
}

export interface ExportDeliveryHistoryResult {
    fileName: string;
    year: number;
    monthName: string;
    totalDeliveries: number;
    morningCount: number;
    eveningCount: number;
    otherDaysCount: number;
}

const getMexicoDateParts = (date: Date) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: MEXICO_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find(p => p.type === type)?.value || '0');

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    // Construct noon UTC from the local calendar date so getUTCDay() is immune to DST or host TZ
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();

    return { year, month, day, dayOfWeek };
};

const formatTimeMexico = (date: Date): string => {
    return date.toLocaleTimeString('es-MX', {
        timeZone: MEXICO_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
};

export const formatDurationBetweenMs = (startMs: number, endMs: number): string => {
    const diffMs = Math.max(0, endMs - startMs);
    const totalMinutes = Math.round(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} min`;
    return `${hours} h ${String(minutes).padStart(2, '0')} min`;
};

const normalizeRouteType = (raw: string | null | undefined): NormalizedRouteType | null => {
    const value = (raw || '').trim().toLowerCase();
    if (value === 'morning' || value === 'matutina') return 'morning';
    if (value === 'evening' || value === 'vespertina') return 'evening';
    return null;
};

const pad2 = (num: number): string => String(num).padStart(2, '0');

/**
 * Normalizes raw `delivery_logs` rows into Mexico City local time & official delivery buckets.
 * Pure helper so it can also be unit-verified easily.
 */
export const buildDeliveryHistoryReport = (
    rows: RawDeliveryLogRow[],
    driverMap: Map<string, string>,
    monthName: string,
    targetYear: number
): DeliveryHistoryReportData => {
    const monthIndex = MONTH_NAMES.findIndex(
        m => m.toLowerCase() === monthName.trim().toLowerCase()
    );
    const monthNumber = monthIndex >= 0 ? monthIndex + 1 : getMexicoDateParts(new Date()).month;

    const normalized: NormalizedDeliveryEntry[] = [];

    for (const row of rows) {
        if ((row.status || '').trim().toLowerCase() !== 'delivered') continue;
        const routeType = normalizeRouteType(row.route_type);
        if (!routeType) continue;

        let timestampDate: Date | null = null;
        let hasExactTimestamp = false;

        if (row.delivered_at) {
            const parsed = new Date(row.delivered_at);
            if (!isNaN(parsed.getTime())) {
                timestampDate = parsed;
                hasExactTimestamp = true;
            }
        }

        if (!timestampDate && row.delivery_date) {
            const fallback = new Date(`${row.delivery_date}T12:00:00-06:00`);
            if (!isNaN(fallback.getTime())) {
                timestampDate = fallback;
            }
        }

        if (!timestampDate) continue;

        const { year, month, day, dayOfWeek } = getMexicoDateParts(timestampDate);
        if (year !== targetYear || month !== monthNumber) continue;

        const weekdayName = WEEKDAY_NAMES[dayOfWeek] || 'Desconocido';
        const localDateKey = `${year}-${pad2(month)}-${pad2(day)}`;
        const displayDate = `${pad2(day)}/${pad2(month)}/${year}`;
        const longDateLabel = `${weekdayName} ${pad2(day)} de ${MONTH_NAMES[month - 1]} de ${year}`;

        const driverId = row.driver_id || 'sin-repartidor';
        const resolvedDriverName =
            (driverMap.get(driverId) || '').trim() ||
            (row.driver_id ? `Repartidor (${row.driver_id.slice(0, 6)})` : 'Sin asignar');

        normalized.push({
            driverId,
            driverName: resolvedDriverName,
            clientName: (row.client_name || '').trim() || `Cliente #${row.client_order ?? '?'}`,
            clientOrder: Number(row.client_order) || 0,
            routeType,
            routeLabel: routeType === 'morning' ? 'Ruta Matutina' : 'Ruta Vespertina',
            localDateKey,
            displayDate,
            longDateLabel,
            year,
            month,
            day,
            dayOfWeek,
            weekdayName,
            deliveredAtMs: timestampDate.getTime(),
            formattedTime: hasExactTimestamp ? formatTimeMexico(timestampDate) : 'Sin hora registrada',
            hasExactTimestamp,
        });
    }

    // Sort chronologically first, then by route, driver, and completion timestamp
    normalized.sort((a, b) => {
        if (a.localDateKey !== b.localDateKey) return a.localDateKey.localeCompare(b.localDateKey);
        if (a.routeType !== b.routeType) return a.routeType === 'morning' ? -1 : 1;
        const driverCmp = a.driverName.localeCompare(b.driverName, 'es');
        if (driverCmp !== 0) return driverCmp;
        if (a.deliveredAtMs !== b.deliveredAtMs) return a.deliveredAtMs - b.deliveredAtMs;
        return a.clientOrder - b.clientOrder;
    });

    const isOfficialDay = (entry: NormalizedDeliveryEntry): boolean => {
        if (entry.routeType === 'morning') {
            return entry.dayOfWeek === 1 || entry.dayOfWeek === 4; // Lunes y Jueves
        }
        return entry.dayOfWeek === 3 || entry.dayOfWeek === 0; // Miércoles y Domingo
    };

    const officialEntries = normalized.filter(isOfficialDay);
    const otherDayEntries = normalized.filter(e => !isOfficialDay(e));

    // Build per-(date + route + driver) summaries for official delivery days
    const summaryMap = new Map<string, NormalizedDeliveryEntry[]>();
    for (const entry of officialEntries) {
        const key = `${entry.localDateKey}|${entry.routeType}|${entry.driverName}`;
        const list = summaryMap.get(key) || [];
        list.push(entry);
        summaryMap.set(key, list);
    }

    const driverDaySummaries: DriverDaySummary[] = [];
    for (const entries of summaryMap.values()) {
        const ordered = [...entries].sort((a, b) => {
            if (a.deliveredAtMs !== b.deliveredAtMs) return a.deliveredAtMs - b.deliveredAtMs;
            return a.clientOrder - b.clientOrder;
        });
        const first = ordered[0];
        const timed = ordered.filter(e => e.hasExactTimestamp);
        const firstTimed = timed[0];
        const lastTimed = timed[timed.length - 1];

        driverDaySummaries.push({
            routeType: first.routeType,
            routeLabel: first.routeLabel,
            dayOfWeek: first.dayOfWeek,
            weekdayName: first.weekdayName,
            localDateKey: first.localDateKey,
            displayDate: first.displayDate,
            longDateLabel: first.longDateLabel,
            driverName: first.driverName,
            totalDeliveries: ordered.length,
            firstDeliveryTime: firstTimed ? firstTimed.formattedTime : 'Sin hora',
            lastDeliveryTime: lastTimed ? lastTimed.formattedTime : 'Sin hora',
            durationLabel:
                firstTimed && lastTimed
                    ? formatDurationBetweenMs(firstTimed.deliveredAtMs, lastTimed.deliveredAtMs)
                    : '—',
            entries: ordered,
        });
    }

    driverDaySummaries.sort((a, b) => {
        if (a.localDateKey !== b.localDateKey) return a.localDateKey.localeCompare(b.localDateKey);
        if (a.routeType !== b.routeType) return a.routeType === 'morning' ? -1 : 1;
        return a.driverName.localeCompare(b.driverName, 'es');
    });

    return {
        monthName,
        monthNumber,
        year: targetYear,
        officialEntries,
        otherDayEntries,
        driverDaySummaries,
    };
};

/**
 * Read-only query to fetch all `delivered` records around a given month and year.
 * Uses pagination (1000 rows per page) so large months never truncate.
 * Never mutates any route, sheet, or active delivery state.
 */
async function fetchMonthDeliveryLogsReadOnly(
    monthNumber: number,
    year: number
): Promise<RawDeliveryLogRow[]> {
    const startUtc = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0));
    startUtc.setUTCDate(startUtc.getUTCDate() - 1); // buffer for Mexico City TZ
    const endUtc = new Date(Date.UTC(year, monthNumber, 1, 23, 59, 59));
    endUtc.setUTCDate(endUtc.getUTCDate() + 1);

    const startDateStr = startUtc.toISOString().split('T')[0];
    const endDateStr = endUtc.toISOString().split('T')[0];

    const allRows: RawDeliveryLogRow[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('delivery_logs')
            .select('driver_id, client_name, client_order, route_type, status, delivered_at, delivery_date')
            .eq('status', 'delivered')
            .gte('delivery_date', startDateStr)
            .lte('delivery_date', endDateStr)
            .order('delivered_at', { ascending: true, nullsFirst: false })
            .range(from, from + pageSize - 1);

        if (error) {
            throw new Error(`No se pudieron leer las entregas: ${error.message}`);
        }

        const batch = (data || []) as RawDeliveryLogRow[];
        allRows.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
    }

    return allRows;
}

async function fetchDriversReadOnly(): Promise<Map<string, string>> {
    const { data, error } = await supabase
        .from('drivers')
        .select('id, name');

    if (error) {
        console.warn('[DeliveryHistoryExport] No se pudieron leer nombres de repartidores:', error.message);
        return new Map();
    }

    const map = new Map<string, string>();
    (data || []).forEach((d: { id: string; name: string }) => {
        if (d.id) map.set(d.id, d.name || '');
    });
    return map;
}

const BORDER_THIN = {
    top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
};

const BORDER_MEDIUM_TOP = {
    top: { style: 'medium' as const, color: { argb: 'FF94A3B8' } },
    left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
    right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
};

/**
 * Builds the styled Excel workbook buffer using ExcelJS.
 * Separated from browser download trigger for testability.
 */
export async function generateDeliveryHistoryWorkbookBuffer(
    report: DeliveryHistoryReportData
): Promise<ArrayBuffer> {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'Healthy Dreams - Sistema de Rutas';
    workbook.created = new Date();

    const generatedAtLabel = new Date().toLocaleString('es-MX', {
        timeZone: MEXICO_TIMEZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });

    // =========================================================================
    // HOJA 1: RESUMEN GENERAL
    // =========================================================================
    const summarySheet = workbook.addWorksheet('Resumen', {
        views: [{ state: 'frozen', ySplit: 6 }],
    });

    summarySheet.columns = [
        { width: 20 }, // A: Ruta
        { width: 16 }, // B: Día Reparto
        { width: 14 }, // C: Fecha
        { width: 24 }, // D: Repartidor
        { width: 14 }, // E: Entregas
        { width: 18 }, // F: Primera Entrega
        { width: 20 }, // G: Última Entrega (Fin)
        { width: 16 }, // H: Duración Ruta
    ];

    summarySheet.mergeCells('A1:H1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = `HEALTHY DREAMS — HISTORIAL DE TIEMPOS DE ENTREGA (${report.monthName.toUpperCase()} ${report.year})`;
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    summarySheet.getRow(1).height = 30;

    summarySheet.mergeCells('A2:H2');
    const subtitleCell = summarySheet.getCell('A2');
    subtitleCell.value = `Vespertina: Miércoles y Domingo  •  Matutina: Lunes y Jueves  •  Zona horaria: Ciudad de México  •  Generado: ${generatedAtLabel}`;
    subtitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    summarySheet.getRow(2).height = 22;

    const morningTotal = report.officialEntries.filter(e => e.routeType === 'morning').length;
    const eveningTotal = report.officialEntries.filter(e => e.routeType === 'evening').length;
    const uniqueDates = new Set(report.officialEntries.map(e => `${e.localDateKey}-${e.routeType}`)).size;
    const uniqueDrivers = new Set(report.officialEntries.map(e => e.driverName)).size;

    const kpis = [
        { label: 'TOTAL ENTREGAS', val: report.officialEntries.length, colSpan: 'A4:B4', valSpan: 'A5:B5', bg: 'FFECFDF5', fg: 'FF065F46' },
        { label: 'MATUTINA (LUN / JUE)', val: morningTotal, colSpan: 'C4:D4', valSpan: 'C5:D5', bg: 'FFFEF3C7', fg: 'FF92400E' },
        { label: 'VESPERTINA (MIÉ / DOM)', val: eveningTotal, colSpan: 'E4:F4', valSpan: 'E5:F5', bg: 'FFE0E7FF', fg: 'FF3730A3' },
        { label: 'JORNADAS / REPARTIDORES', val: `${uniqueDates} días / ${uniqueDrivers} rep.`, colSpan: 'G4:H4', valSpan: 'G5:H5', bg: 'FFF1F5F9', fg: 'FF1E293B' },
    ];

    summarySheet.getRow(3).height = 8;
    summarySheet.getRow(4).height = 18;
    summarySheet.getRow(5).height = 26;

    kpis.forEach(k => {
        summarySheet.mergeCells(k.colSpan);
        summarySheet.mergeCells(k.valSpan);
        const startLabel = k.colSpan.split(':')[0];
        const startVal = k.valSpan.split(':')[0];

        const lc = summarySheet.getCell(startLabel);
        lc.value = k.label;
        lc.font = { name: 'Calibri', size: 9, bold: true, color: { argb: k.fg } };
        lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.bg } };
        lc.alignment = { vertical: 'middle', horizontal: 'center' };
        lc.border = BORDER_THIN;

        const vc = summarySheet.getCell(startVal);
        vc.value = k.val;
        vc.font = { name: 'Calibri', size: 13, bold: true, color: { argb: k.fg } };
        vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.bg } };
        vc.alignment = { vertical: 'middle', horizontal: 'center' };
        vc.border = BORDER_THIN;
    });

    const summaryHeaders = [
        'Ruta',
        'Día de Reparto',
        'Fecha',
        'Repartidor',
        'Entregas',
        'Primera Entrega',
        'Última Entrega (Fin)',
        'Tiempo en Ruta',
    ];

    const headerRow = summarySheet.getRow(6);
    headerRow.height = 24;
    summaryHeaders.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle', horizontal: idx === 4 ? 'center' : 'left', indent: idx === 4 ? 0 : 1 };
        cell.border = BORDER_THIN;
    });

    let sumRowIdx = 7;
    if (report.driverDaySummaries.length === 0) {
        summarySheet.mergeCells(`A${sumRowIdx}:H${sumRowIdx}`);
        const emptyCell = summarySheet.getCell(`A${sumRowIdx}`);
        emptyCell.value = `No se encontraron entregas registradas en días oficiales para ${report.monthName} ${report.year}.`;
        emptyCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
        emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
        summarySheet.getRow(sumRowIdx).height = 28;
    } else {
        report.driverDaySummaries.forEach((item, idx) => {
            const row = summarySheet.getRow(sumRowIdx++);
            row.height = 21;
            const isEven = idx % 2 === 1;
            const routeBg = item.routeType === 'morning' ? 'FFFEF3C7' : 'FFE0E7FF';
            const routeFg = item.routeType === 'morning' ? 'FF92400E' : 'FF3730A3';

            const values = [
                item.routeLabel,
                item.weekdayName,
                item.displayDate,
                item.driverName,
                item.totalDeliveries,
                item.firstDeliveryTime,
                item.lastDeliveryTime,
                item.durationLabel,
            ];

            values.forEach((val, colIdx) => {
                const cell = row.getCell(colIdx + 1);
                cell.value = val;
                cell.border = BORDER_THIN;
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: colIdx === 4 ? 'center' : colIdx >= 5 || colIdx === 2 ? 'center' : 'left',
                    indent: colIdx === 0 || colIdx === 1 || colIdx === 3 ? 1 : 0,
                };

                if (colIdx === 0) {
                    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: routeFg } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: routeBg } };
                } else if (colIdx === 6) {
                    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF065F46' } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
                } else {
                    cell.font = {
                        name: 'Calibri',
                        size: 10,
                        bold: colIdx === 3 || colIdx === 4,
                        color: { argb: 'FF0F172A' },
                    };
                    if (isEven) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                    }
                }
            });
        });
    }

    // =========================================================================
    // HOJAS DEDICADAS POR RUTA Y DÍA DE REPARTO
    // =========================================================================
    const populateDetailSheet = (
        sheetName: string,
        title: string,
        subtitle: string,
        headerHex: string,
        accentHex: string,
        tintHex: string,
        entries: NormalizedDeliveryEntry[]
    ) => {
        const ws = workbook.addWorksheet(sheetName, {
            views: [{ state: 'frozen', ySplit: 3 }],
        });

        ws.columns = [
            { width: 8 },  // A: #
            { width: 25 }, // B: Repartidor
            { width: 14 }, // C: Orden Ruta
            { width: 36 }, // D: Cliente
            { width: 20 }, // E: Hora de Entrega
            { width: 15 }, // F: Fecha
        ];

        ws.mergeCells('A1:F1');
        const tCell = ws.getCell('A1');
        tCell.value = title;
        tCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerHex } };
        tCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        ws.getRow(1).height = 28;

        ws.mergeCells('A2:F2');
        const sCell = ws.getCell('A2');
        sCell.value = subtitle;
        sCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
        sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tintHex } };
        sCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        ws.getRow(2).height = 21;

        const colHeaders = ['#', 'Repartidor', 'Orden Ruta', 'Cliente', 'Hora de Entrega', 'Fecha'];
        const hRow = ws.getRow(3);
        hRow.height = 23;
        colHeaders.forEach((h, idx) => {
            const c = hRow.getCell(idx + 1);
            c.value = h;
            c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            c.alignment = {
                vertical: 'middle',
                horizontal: idx === 0 || idx === 2 || idx === 4 || idx === 5 ? 'center' : 'left',
                indent: idx === 1 || idx === 3 ? 1 : 0,
            };
            c.border = BORDER_THIN;
        });

        let rowCursor = 4;

        if (entries.length === 0) {
            ws.mergeCells(`A${rowCursor}:F${rowCursor}`);
            const c = ws.getCell(`A${rowCursor}`);
            c.value = `Sin entregas registradas para este día en ${report.monthName} ${report.year}.`;
            c.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
            c.alignment = { vertical: 'middle', horizontal: 'center' };
            ws.getRow(rowCursor).height = 28;
            return;
        }

        // Group by calendar date (chronological)
        const byDate = new Map<string, NormalizedDeliveryEntry[]>();
        for (const e of entries) {
            const list = byDate.get(e.localDateKey) || [];
            list.push(e);
            byDate.set(e.localDateKey, list);
        }

        for (const dateEntries of byDate.values()) {
            const firstEntry = dateEntries[0];
            const timedDateEntries = dateEntries.filter(e => e.hasExactTimestamp);
            const lastDateDelivery =
                timedDateEntries.length > 0
                    ? timedDateEntries[timedDateEntries.length - 1].formattedTime
                    : 'Sin hora';

            // Date separator banner
            ws.mergeCells(`A${rowCursor}:F${rowCursor}`);
            const dateBanner = ws.getCell(`A${rowCursor}`);
            dateBanner.value = `JORNADA: ${firstEntry.longDateLabel.toUpperCase()}   •   ${dateEntries.length} entregas   •   Última entrega del día: ${lastDateDelivery}`;
            dateBanner.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            dateBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentHex } };
            dateBanner.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
            ws.getRow(rowCursor).height = 24;
            rowCursor++;

            // Group within date by driver name
            const byDriver = new Map<string, NormalizedDeliveryEntry[]>();
            for (const e of dateEntries) {
                const list = byDriver.get(e.driverName) || [];
                list.push(e);
                byDriver.set(e.driverName, list);
            }

            const sortedDrivers = Array.from(byDriver.keys()).sort((a, b) => a.localeCompare(b, 'es'));

            for (const driverName of sortedDrivers) {
                const driverRows = [...(byDriver.get(driverName) || [])].sort((a, b) => {
                    if (a.deliveredAtMs !== b.deliveredAtMs) return a.deliveredAtMs - b.deliveredAtMs;
                    return a.clientOrder - b.clientOrder;
                });

                const timedDriverRows = driverRows.filter(e => e.hasExactTimestamp);
                const firstTime = timedDriverRows[0]?.formattedTime || 'Sin hora';
                const lastTime = timedDriverRows[timedDriverRows.length - 1]?.formattedTime || 'Sin hora';
                const duration =
                    timedDriverRows.length >= 2
                        ? formatDurationBetweenMs(
                              timedDriverRows[0].deliveredAtMs,
                              timedDriverRows[timedDriverRows.length - 1].deliveredAtMs
                          )
                        : '—';

                driverRows.forEach((entry, idx) => {
                    const row = ws.getRow(rowCursor++);
                    row.height = 20;
                    const isEven = idx % 2 === 1;
                    const isLastOfDriver = idx === driverRows.length - 1;

                    const cells = [
                        idx + 1,
                        entry.driverName,
                        entry.clientOrder > 0 ? `#${entry.clientOrder}` : '—',
                        entry.clientName,
                        entry.formattedTime,
                        entry.displayDate,
                    ];

                    cells.forEach((val, colIdx) => {
                        const cell = row.getCell(colIdx + 1);
                        cell.value = val;
                        cell.border = BORDER_THIN;
                        cell.alignment = {
                            vertical: 'middle',
                            horizontal: colIdx === 0 || colIdx === 2 || colIdx === 4 || colIdx === 5 ? 'center' : 'left',
                            indent: colIdx === 1 || colIdx === 3 ? 1 : 0,
                        };

                        if (colIdx === 4 && isLastOfDriver && entry.hasExactTimestamp) {
                            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF065F46' } };
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
                        } else {
                            cell.font = {
                                name: 'Calibri',
                                size: 10,
                                bold: colIdx === 1,
                                color: { argb: colIdx === 4 ? 'FF0F766E' : 'FF0F172A' },
                            };
                            if (isEven) {
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                            }
                        }
                    });
                });

                // Driver completion summary row
                ws.mergeCells(`A${rowCursor}:F${rowCursor}`);
                const driverFooter = ws.getCell(`A${rowCursor}`);
                driverFooter.value = `✓ Resumen ${driverName}: ${driverRows.length} entregas  |  Primera: ${firstTime}  |  Finalizó ruta: ${lastTime}  |  Duración: ${duration}`;
                driverFooter.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF065F46' } };
                driverFooter.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
                driverFooter.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                for (let col = 1; col <= 6; col++) {
                    ws.getRow(rowCursor).getCell(col).border = BORDER_MEDIUM_TOP;
                }
                ws.getRow(rowCursor).height = 21;
                rowCursor++;
            }

            // Visual gap between delivery dates
            ws.getRow(rowCursor).height = 10;
            rowCursor++;
        }
    };

    for (const bucket of OFFICIAL_ROUTE_DAY_BUCKETS) {
        const bucketEntries = report.officialEntries.filter(
            e => e.routeType === bucket.routeType && e.dayOfWeek === bucket.dayOfWeek
        );
        populateDetailSheet(
            bucket.sheetName,
            `${bucket.routeLabel.toUpperCase()} — DÍA: ${bucket.weekdayName.toUpperCase()} (${report.monthName.toUpperCase()} ${report.year})`,
            `Historial de entregas finalizadas • ${bucket.routeLabel} • Repartos de ${bucket.weekdayName} • ${bucketEntries.length} entregas registradas`,
            bucket.headerHex,
            bucket.accentHex,
            bucket.tintHex,
            bucketEntries
        );
    }

    if (report.otherDayEntries.length > 0) {
        populateDetailSheet(
            'Otros Días',
            `ENTREGAS FUERA DE DÍAS HABITUALES (${report.monthName.toUpperCase()} ${report.year})`,
            `Registros en días distintos a Lunes/Jueves (Matutina) o Miércoles/Domingo (Vespertina) • ${report.otherDayEntries.length} entregas`,
            'FF475569',
            'FF64748B',
            'FFF1F5F9',
            report.otherDayEntries
        );
    }

    return await workbook.xlsx.writeBuffer();
}

/**
 * Queries read-only delivery history for the selected month and downloads a formatted `.xlsx` spreadsheet.
 * Completely non-destructive: performs zero writes and leaves active routes untouched.
 */
export async function exportDeliveryHistoryExcel(
    monthName: string
): Promise<ExportDeliveryHistoryResult> {
    const monthIndex = MONTH_NAMES.findIndex(
        m => m.toLowerCase() === monthName.trim().toLowerCase()
    );
    const nowParts = getMexicoDateParts(new Date());
    const monthNumber = monthIndex >= 0 ? monthIndex + 1 : nowParts.month;

    // Resolve most relevant year (current year; if user picks a future month relative to now, check current first then fallback to prior year)
    let targetYear = nowParts.year;
    let rawRows = await fetchMonthDeliveryLogsReadOnly(monthNumber, targetYear);

    if (rawRows.length === 0 && monthNumber > nowParts.month) {
        const prevYearRows = await fetchMonthDeliveryLogsReadOnly(monthNumber, targetYear - 1);
        if (prevYearRows.length > 0) {
            targetYear = targetYear - 1;
            rawRows = prevYearRows;
        }
    }

    const driverMap = await fetchDriversReadOnly();
    const report = buildDeliveryHistoryReport(rawRows, driverMap, monthName, targetYear);

    const totalDeliveries = report.officialEntries.length + report.otherDayEntries.length;
    if (totalDeliveries === 0) {
        throw new Error(
            `No hay entregas finalizadas registradas en ${monthName} ${targetYear}.`
        );
    }

    const buffer = await generateDeliveryHistoryWorkbookBuffer(report);
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const safeMonth = monthName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const fileName = `historial_tiempos_entrega_${safeMonth}_${targetYear}.xlsx`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return {
        fileName,
        year: targetYear,
        monthName,
        totalDeliveries,
        morningCount: report.officialEntries.filter(e => e.routeType === 'morning').length,
        eveningCount: report.officialEntries.filter(e => e.routeType === 'evening').length,
        otherDaysCount: report.otherDayEntries.length,
    };
}
