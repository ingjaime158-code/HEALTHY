import React, { useEffect, useState, useMemo } from 'react';
import { fetchMileageData, DaySummary, MileageRecord } from '../services/mileageService';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    AreaChart, Area, LabelList 
} from 'recharts';
import { supabase } from '../services/supabaseClient';
import { 
    buildDriverProgress, 
    calculateRouteDistance, 
    fetchDriverOrderMap, 
    parseCoords, 
    calculateGoogleDrivingDistance 
} from '../services/routeMonitorService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo'];

const MORNING_SHEET_ID = "1fWjuO_bGy4cvO0-Ru-u2lbnJcD8ZJFg3ovTaD7kIDzE";
const EVENING_SHEET_ID = "1y7V-6nwmsJv_bY38PzjFhIFWaUPu8EW4IvQD23T008U";
const MORNING_GID = "1075208342";
const EVENING_GID = "2039339913";

interface DriverIndividualStop {
    order: number;
    name: string;
    coords: string;
}

const fetchDriverIndividualRoute = async (sheetUrl: string): Promise<{ startCoords: string | null; stops: DriverIndividualStop[] }> => {
    const stops: DriverIndividualStop[] = [];
    let startCoords: string | null = null;

    if (!sheetUrl) return { startCoords, stops };

    // Extraer ID y GID de la URL
    const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
    if (!sheetId) return { startCoords, stops };

    const gidMatch = sheetUrl.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}&tcb=${Date.now()}`;

    try {
        const response = await fetch(csvUrl);
        if (!response.ok) return { startCoords, stops };

        const text = await response.text();
        
        // CSV Parsing robusto
        const parsedRows: string[][] = [];
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
                parsedRows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
        if (currentField.length > 0 || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            parsedRows.push(currentRow);
        }

        const validRows = parsedRows.filter(row => row.some(field => field.length > 0));
        if (validRows.length < 2) return { startCoords, stops };

        const header = validRows[0].map(h => h.toUpperCase());
        const ordenIdx = header.findIndex(h => h.includes('ORDEN'));
        const nombreIdx = header.findIndex(h => h.includes('NOMBRE'));
        const linkIdx = header.findIndex(h => h.includes('LINK'));
        const coordsIdx = header.findIndex(h => h === 'UBICACIÓN' || h === 'UBICACION');

        if (ordenIdx === -1 || nombreIdx === -1) return { startCoords, stops };

        for (let i = 1; i < validRows.length; i++) {
            const fields = validRows[i];
            if (fields.length <= ordenIdx) continue;
            
            const ordenVal = fields[ordenIdx];
            const orden = parseInt(ordenVal || '', 10);
            if (isNaN(orden)) continue;

            const nombre = (fields[nombreIdx] || '').trim();
            let coords = coordsIdx >= 0 ? (fields[coordsIdx] || '').trim() : '';
            const link = linkIdx >= 0 ? (fields[linkIdx] || '').trim() : '';
            
            if (!coords && link) {
                const match = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/) || link.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/) || link.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
                if (match) coords = `${match[1]}, ${match[2]}`;
            }

            if (orden === 0) {
                if (coords) startCoords = coords;
            } else if (nombre && coords) {
                stops.push({
                    order: orden,
                    name: nombre,
                    coords
                });
            }
        }

        stops.sort((a, b) => a.order - b.order);

    } catch (e) {
        console.error("Error al parsear la hoja individual del chofer:", e);
    }

    return { startCoords, stops };
};

const parseDateString = (dateStr: string) => {
    const parts = dateStr.split(' ');
    if (parts.length < 2) return new Date(0);
    const dateParts = parts[1].split('-');
    if (dateParts.length < 3) return new Date(0);
    const d = parseInt(dateParts[0], 10);
    const m = parseInt(dateParts[1], 10);
    const y = parseInt(dateParts[2], 10);
    // Assuming 2000 + y for the year
    return new Date(2000 + y, m - 1, d, parts[0] === 'RV' ? 12 : 8);
};

const MileageDashboard: React.FC = () => {
    const [selectedMonth, setSelectedMonth] = useState('Mayo');
    const [data, setData] = useState<DaySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'charts' | 'table'>('charts');
    const [activeMetric, setActiveMetric] = useState<'totalKm' | 'routeKm' | 'customers'>('routeKm');
    const [calculating, setCalculating] = useState(false);
    const [calculationDate, setCalculationDate] = useState<string>(
        new Date().toISOString().split('T')[0]
    );

    const handleCalculateTodayKm = async () => {
        setCalculating(true);
        try {
            // 1. Fetch drivers from DB
            const { data: dbDrivers, error: driversError } = await supabase
                .from('drivers')
                .select('id, name, color_hex, morning_sheet_url, evening_sheet_url');

            if (driversError || !dbDrivers) {
                throw new Error(driversError?.message || "No se pudieron cargar los choferes de la base de datos.");
            }

            // 2. Fetch routes progress for Morning and Evening
            const morningDrivers = await buildDriverProgress(MORNING_SHEET_ID, MORNING_GID, 'morning', dbDrivers);
            const eveningDrivers = await buildDriverProgress(EVENING_SHEET_ID, EVENING_GID, 'evening', dbDrivers);

            // 3. Formatear fecha del cálculo
            // La fecha seleccionada en el input corresponde a la Ruta Vespertina (RV)
            const dateEveningObj = new Date(calculationDate + 'T00:00:00');
            const dayEve = String(dateEveningObj.getDate()).padStart(2, '0');
            const monthEve = String(dateEveningObj.getMonth() + 1).padStart(2, '0');
            const yearEve = String(dateEveningObj.getFullYear()).slice(-2);
            const formattedEveningDate = `${dayEve}-${monthEve}-${yearEve}`;

            // La Ruta Matutina (RM) corresponde al día siguiente
            const dateMorningObj = new Date(calculationDate + 'T00:00:00');
            dateMorningObj.setDate(dateMorningObj.getDate() + 1);
            const dayMor = String(dateMorningObj.getDate()).padStart(2, '0');
            const monthMor = String(dateMorningObj.getMonth() + 1).padStart(2, '0');
            const yearMor = String(dateMorningObj.getFullYear()).slice(-2);
            const formattedMorningDate = `${dayMor}-${monthMor}-${yearMor}`;

            const records: MileageRecord[] = [];

            // Morning
            for (const driver of morningDrivers) {
                if (driver.totalClients === 0) continue;

                const dbDriver = dbDrivers.find(d => d.name.toUpperCase().trim() === driver.driverName.toUpperCase().trim());
                const driverSheetUrl = dbDriver?.morning_sheet_url || '';
                if (!driverSheetUrl) {
                    console.warn(`[MileageDashboard] Chofer ${driver.driverName} (Matutina) no tiene URL de hoja de cálculo en la base de datos.`);
                    continue;
                }
                
                const { startCoords, stops } = await fetchDriverIndividualRoute(driverSheetUrl);
                if (stops.length === 0) {
                    console.warn(`[MileageDashboard] Chofer ${driver.driverName} (Matutina) sin paradas activas hoy.`);
                    continue;
                }

                const routeClients = stops.map(s => ({
                    order: s.order,
                    name: s.name,
                    coords: s.coords,
                    phone: '',
                    address: '',
                    locationLink: '',
                    repartidor: driver.driverName,
                    bags: 0
                }));

                // Calcular KM Totales (recorrido completo de la ruta)
                const totalKm = await calculateRouteDistance(startCoords, routeClients);
                
                // Calcular distancia del punto de origen al primer cliente
                let initialDistance = 0;
                if (startCoords && stops.length > 0) {
                    const startPt = parseCoords(startCoords);
                    const firstPt = parseCoords(stops[0].coords);
                    if (startPt && firstPt) {
                        initialDistance = await calculateGoogleDrivingDistance([startPt, firstPt]);
                    }
                }
                
                // KM Ruta = KM Totales - distancia del inicio al primer cliente
                const routeKm = Math.max(0, parseFloat((totalKm - initialDistance).toFixed(1)));

                records.push({
                    date: `RM ${formattedMorningDate}`,
                    driver: driver.driverName,
                    totalKm: parseFloat(totalKm.toFixed(1)),
                    routeKm,
                    customers: routeClients.length
                });
            }

            // Evening
            for (const driver of eveningDrivers) {
                if (driver.totalClients === 0) continue;

                const dbDriver = dbDrivers.find(d => d.name.toUpperCase().trim() === driver.driverName.toUpperCase().trim());
                const driverSheetUrl = dbDriver?.evening_sheet_url || '';
                if (!driverSheetUrl) {
                    console.warn(`[MileageDashboard] Chofer ${driver.driverName} (Vespertina) no tiene URL de hoja de cálculo en la base de datos.`);
                    continue;
                }
                
                const { startCoords, stops } = await fetchDriverIndividualRoute(driverSheetUrl);
                if (stops.length === 0) {
                    console.warn(`[MileageDashboard] Chofer ${driver.driverName} (Vespertina) sin paradas activas hoy.`);
                    continue;
                }

                const routeClients = stops.map(s => ({
                    order: s.order,
                    name: s.name,
                    coords: s.coords,
                    phone: '',
                    address: '',
                    locationLink: '',
                    repartidor: driver.driverName,
                    bags: 0
                }));

                const totalKm = await calculateRouteDistance(startCoords, routeClients);
                
                let initialDistance = 0;
                if (startCoords && stops.length > 0) {
                    const startPt = parseCoords(startCoords);
                    const firstPt = parseCoords(stops[0].coords);
                    if (startPt && firstPt) {
                        initialDistance = await calculateGoogleDrivingDistance([startPt, firstPt]);
                    }
                }
                
                const routeKm = Math.max(0, parseFloat((totalKm - initialDistance).toFixed(1)));

                records.push({
                    date: `RV ${formattedEveningDate}`,
                    driver: driver.driverName,
                    totalKm: parseFloat(totalKm.toFixed(1)),
                    routeKm,
                    customers: routeClients.length
                });
            }

            if (records.length === 0) {
                alert("No se encontraron paradas activas o rutas asignadas para hoy en las hojas individuales de los repartidores participantes.");
                setCalculating(false);
                return;
            }

            // Agrupar y guardar de forma limpia en el historial (separamos por Matutina y Vespertina)
            setData(prev => {
                // Eliminar cualquier registro existente para evitar duplicados en estas fechas específicas
                const filtered = prev.filter(d => 
                    !(d.date.startsWith('RM') && d.date.endsWith(formattedMorningDate)) &&
                    !(d.date.startsWith('RV') && d.date.endsWith(formattedEveningDate))
                );
                
                const morningRecords = records.filter(r => r.date.startsWith('RM'));
                const eveningRecords = records.filter(r => r.date.startsWith('RV'));

                const summariesToAdd: DaySummary[] = [];
                if (morningRecords.length > 0) {
                    summariesToAdd.push({
                        date: `RM ${formattedMorningDate}`,
                        records: morningRecords
                    });
                }
                if (eveningRecords.length > 0) {
                    summariesToAdd.push({
                        date: `RV ${formattedEveningDate}`,
                        records: eveningRecords
                    });
                }

                return [...filtered, ...summariesToAdd];
            });

            alert(`✅ Cálculo completado con éxito. Se han integrado ${records.length} rutas reales calculadas al historial de este mes.`);

        } catch (err: any) {
            console.error("Error calculating routes KM:", err);
            alert("Error al calcular kilómetros: " + err.message);
        } finally {
            setCalculating(false);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const result = await fetchMileageData(selectedMonth);
                if (!result || result.length === 0) {
                    setData([]);
                } else {
                    setData(result);
                }
                setError(null);
            } catch (err) {
                console.error('Error loading mileage data:', err);
                setError('No se pudo conectar con la hoja de cálculo. Verifica que el archivo sea público.');
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [selectedMonth]);

    // Computed Stats safely
    const stats = useMemo(() => {
        const allRecords = data?.flatMap(d => d.records || []) || [];
        const totalKm = allRecords.reduce((sum, r) => sum + (r.totalKm || 0), 0);
        const totalRouteKm = allRecords.reduce((sum, r) => sum + (r.routeKm || 0), 0);
        const totalCustomers = allRecords.reduce((sum, r) => sum + (r.customers || 0), 0);
        const avgKmPerCustomer = totalCustomers > 0 ? (totalRouteKm / totalCustomers).toFixed(1) : "0";

        return { totalKm, totalRouteKm, totalCustomers, avgKmPerCustomer };
    }, [data]);

    // Chart Data safely
    const dailyChartData = useMemo(() => {
        return data.map(d => {
            const totalKm = d.records ? d.records.reduce((sum, r) => sum + (r.totalKm || 0), 0) : 0;
            const routeKm = d.records ? d.records.reduce((sum, r) => sum + (r.routeKm || 0), 0) : 0;
            const customers = d.records ? d.records.reduce((sum, r) => sum + (r.customers || 0), 0) : 0;
            return {
                date: d.date ? d.date.split(' ').pop() : '?',
                totalKm,
                routeKm,
                customers
            };
        });
    }, [data]);

    const driverChartData = useMemo(() => {
        const drivers: { [key: string]: { name: string, value: number } } = {};
        data.flatMap(d => d.records || []).forEach(r => {
            if (!r.driver) return;
            if (!drivers[r.driver]) {
                drivers[r.driver] = { name: r.driver, value: 0 };
            }
            
            if (activeMetric === 'totalKm') drivers[r.driver].value += (r.totalKm || 0);
            else if (activeMetric === 'routeKm') drivers[r.driver].value += (r.routeKm || 0);
            else if (activeMetric === 'customers') drivers[r.driver].value += (r.customers || 0);
        });

        return Object.values(drivers).sort((a, b) => b.value - a.value);
    }, [data, activeMetric]);

    // Separación para visualización en 2 ventanas de turnos Matutino (RM) y Vespertino (RV)
    const latestEvening = useMemo(() => {
        return [...data].reverse().find(r => r.date.toUpperCase().includes('RV') || r.date.toUpperCase().includes('VESPERTINA'));
    }, [data]);

    const latestMorning = useMemo(() => {
        return [...data].reverse().find(r => r.date.toUpperCase().includes('RM') || r.date.toUpperCase().includes('MATUTINA'));
    }, [data]);

    // Función de exportación a CSV
    const handleExportCSV = () => {
        try {
            const allRecords = data.flatMap(day => 
                day.records.map(record => ({
                    fecha: day.date,
                    repartidor: record.driver,
                    km_totales: record.totalKm,
                    km_ruta: record.routeKm,
                    clientes: record.customers
                }))
            );

            if (allRecords.length === 0) {
                alert("No hay registros en este mes para exportar.");
                return;
            }

            const headers = ["Fecha", "Repartidor", "KM Totales", "KM Ruta", "Clientes"];
            const csvRows = [
                headers.join(','),
                ...allRecords.map(r => [
                    `"${r.fecha}"`,
                    `"${r.repartidor}"`,
                    r.km_totales,
                    r.km_ruta,
                    r.clientes
                ].join(','))
            ];

            const csvContent = csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `reporte_kilometros_${selectedMonth.toLowerCase()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err: any) {
            alert("Error al exportar CSV: " + err.message);
        }
    };

    // Función de exportación a PDF Premium Rediseñado y Agrupado por Fechas
    const handleExportPDF = () => {
        try {
            const doc = new jsPDF();
            
            // Cabecera Corporativa Slate 800
            doc.setFillColor(30, 41, 59);
            doc.rect(0, 0, 210, 40, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(22);
            doc.text("HEALTHY DREAMS", 15, 20);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.setTextColor(156, 163, 175);
            doc.text("REPORTE MENSUAL DE KILÓMETROS Y COBERTURA", 15, 28);
            
            doc.setTextColor(51, 65, 85);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text(`Mes de Consulta: ${selectedMonth}`, 15, 52);
            
            const todayDate = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Fecha de Emisión: ${todayDate}`, 15, 58);

            // Resumen de Métricas en cuadros de estilo Dashboard Premium
            // Card 1: KM Totales
            doc.setFillColor(240, 253, 250);
            doc.roundedRect(15, 65, 55, 24, 3, 3, 'F');
            doc.setFillColor(16, 185, 129);
            doc.rect(15, 65, 3, 24, 'F'); // Left bar
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("KM TOTALES", 22, 73);
            doc.setTextColor(16, 185, 129);
            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.text(`${stats.totalKm.toLocaleString()} km`, 22, 82);

            // Card 2: KM en Ruta
            doc.setFillColor(239, 246, 255);
            doc.roundedRect(77, 65, 55, 24, 3, 3, 'F');
            doc.setFillColor(37, 99, 235);
            doc.rect(77, 65, 3, 24, 'F'); // Left bar
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("KM EN RUTA", 84, 73);
            doc.setTextColor(37, 99, 235);
            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.text(`${stats.totalRouteKm.toLocaleString()} km`, 84, 82);

            // Card 3: Total Clientes
            doc.setFillColor(255, 251, 235);
            doc.roundedRect(140, 65, 55, 24, 3, 3, 'F');
            doc.setFillColor(245, 158, 11);
            doc.rect(140, 65, 3, 24, 'F'); // Left bar
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("TOTAL CLIENTES", 147, 73);
            doc.setTextColor(245, 158, 11);
            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.text(`${stats.totalCustomers.toLocaleString()}`, 147, 82);

            // Agrupar y ordenar cronológicamente
            const sortedData = [...data]
                .filter(d => d.records && d.records.length > 0)
                .sort((a, b) => parseDateString(a.date).getTime() - parseDateString(b.date).getTime());

            if (sortedData.length === 0) {
                alert("No hay registros en este mes para exportar.");
                return;
            }

            let currentY = 100;

            sortedData.forEach((day) => {
                const isEvening = day.date.toUpperCase().includes('RV') || day.date.toUpperCase().includes('VESPERTINA');
                
                // Calcular totales de este turno específico
                const totalTotalKm = day.records.reduce((sum, r) => sum + (r.totalKm || 0), 0);
                const totalRouteKm = day.records.reduce((sum, r) => sum + (r.routeKm || 0), 0);
                const totalCusts = day.records.reduce((sum, r) => sum + (r.customers || 0), 0);

                // Control inteligente de salto de página:
                // Estimamos que una sección con N repartidores necesita:
                // ~8mm de banner + ~10mm de cabeceras + N * ~7mm de filas + ~10mm de footer + ~10mm de margen de seguridad = 38 + 7*N mm.
                const heightNeeded = 38 + (day.records.length * 7);
                if (currentY + heightNeeded > 275) {
                    doc.addPage();
                    currentY = 25; // Comenzar más abajo en páginas subsiguientes
                }

                // Banner de Turno/Fecha
                // Violeta profundo para Vespertina (RV), Azul corporativo para Matutina (RM)
                const r = isEvening ? 124 : 37;
                const g = isEvening ? 58 : 99;
                const b = isEvening ? 237 : 235;
                
                doc.setFillColor(r, g, b);
                doc.roundedRect(15, currentY, 180, 8, 1.5, 1.5, 'F');
                
                doc.setTextColor(255, 255, 255);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(9.5);
                const bannerText = isEvening 
                    ? `🌌 RUTA VESPERTINA - ${day.date}` 
                    : `☀️ RUTA MATUTINA - ${day.date}`;
                doc.text(bannerText, 20, currentY + 5.5);

                currentY += 11;

                // Tabla autotable limpia
                autoTable(doc, {
                    startY: currentY,
                    head: [["Repartidor", "KM Totales", "KM Ruta", "Total Clientes"]],
                    body: day.records.map(rec => [
                        rec.driver,
                        `${rec.totalKm} km`,
                        `${rec.routeKm} km`,
                        `${rec.customers} clientes`
                    ]),
                    foot: [["Total del Turno", `${totalTotalKm.toFixed(1)} km`, `${totalRouteKm.toFixed(1)} km`, `${totalCusts} clientes`]],
                    theme: 'striped',
                    headStyles: {
                        fillColor: isEvening ? [139, 92, 246] : [59, 130, 246], // Tonos más suaves del color del turno
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        fontSize: 8.5
                    },
                    bodyStyles: {
                        fontSize: 8.5,
                        textColor: [51, 65, 85]
                    },
                    footStyles: {
                        fillColor: [241, 245, 249],
                        textColor: [30, 41, 59],
                        fontStyle: 'bold',
                        fontSize: 8.5
                    },
                    columnStyles: {
                        0: { cellWidth: 70 },
                        1: { cellWidth: 35, halign: 'right' },
                        2: { cellWidth: 35, halign: 'right' },
                        3: { cellWidth: 40, halign: 'right' }
                    },
                    margin: { left: 15, right: 15 }
                });

                // Actualizar coordenada Y
                currentY = (doc as any).lastAutoTable.finalY + 12;
            });

            // Pase final sobre las páginas para colocar encabezados de continuidad y números de página
            const pageCount = (doc as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                
                // Dibujar encabezado en página 2 en adelante
                if (i > 1) {
                    doc.setFillColor(30, 41, 59);
                    doc.rect(0, 0, 210, 15, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(9);
                    doc.text(`HEALTHY DREAMS  |  REPORTE DE KILÓMETROS (${selectedMonth.toUpperCase()})`, 15, 10);
                }

                // Dibujar pie de página elegante en todas las páginas
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.5);
                doc.line(15, 282, 195, 282);
                
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text("Healthy Dreams - Reporte generado automáticamente", 15, 288);
                doc.text(`Página ${i} de ${pageCount}`, 195, 288, { align: 'right' });
            }

            doc.save(`reporte_kilometros_${selectedMonth.toLowerCase()}.pdf`);
        } catch (err: any) {
            alert("Error al exportar PDF: " + err.message);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col h-full w-full items-center justify-center bg-slate-50 gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                <p className="text-slate-500 font-bold">Cargando Historial...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-[#f8fafc] overflow-y-auto p-4 md:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-blue-600 bg-blue-50 p-2 rounded-2xl shadow-sm">route</span>
                        Historial de Kilómetros
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 ml-1">Análisis de rendimiento y recorridos de la flota</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition-all active:scale-95 cursor-pointer"
                        title="Exportar a CSV"
                    >
                        <span className="material-symbols-outlined text-sm text-slate-500">file_download</span>
                        <span>CSV</span>
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition-all active:scale-95 cursor-pointer"
                        title="Exportar a PDF"
                    >
                        <span className="material-symbols-outlined text-sm text-red-500">picture_as_pdf</span>
                        <span>PDF</span>
                    </button>

                    <select 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>

                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                        <button 
                            onClick={() => setViewMode('charts')}
                            className={`p-2 rounded-lg transition-all flex items-center ${viewMode === 'charts' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                        >
                            <span className="material-symbols-outlined">bar_chart</span>
                        </button>
                        <button 
                            onClick={() => setViewMode('table')}
                            className={`p-2 rounded-lg transition-all flex items-center ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                        >
                            <span className="material-symbols-outlined">table_chart</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Calculadora Banner */}
            <div className="bg-white border border-slate-100 rounded-[2rem] shadow-xl shadow-slate-900/5 p-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-4 flex-1">
                    <span className="material-symbols-outlined text-4xl text-indigo-600 bg-indigo-50 p-3 rounded-2xl shadow-sm">auto_activity_zone</span>
                    <div>
                        <h3 className="font-black text-slate-900 text-base">Cálculo de Kilómetros</h3>
                        <p className="text-slate-500 text-xs font-semibold mt-0.5">Calcula automáticamente el kilometraje de conducción secuencial por repartidor para la fecha seleccionada.</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 w-full md:w-auto">
                    <div className="flex flex-col gap-1 shrink-0">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Fecha de Ruta</span>
                        <input
                            type="date"
                            value={calculationDate}
                            onChange={(e) => setCalculationDate(e.target.value)}
                            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        />
                    </div>
                    <button
                        onClick={handleCalculateTodayKm}
                        disabled={calculating}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/20 font-bold transition-all active:scale-95 disabled:bg-slate-300 disabled:shadow-none cursor-pointer h-[42px]"
                    >
                        {calculating ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                <span>Calculando...</span>
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-lg">route</span>
                                <span>Calcular Kilómetros</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Rutas Recientes (Vespertina a la izquierda, Matutina a la derecha) */}
            <div className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                    <div className="h-1 w-12 bg-blue-600 rounded-full"></div>
                    <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Últimas Rutas Capturadas</h2>
                </div>
                
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* Bloque Vespertino (Izquierda) */}
                    <div className="bg-white rounded-[2rem] shadow-xl shadow-blue-900/5 border border-slate-100 overflow-hidden transition-all hover:shadow-2xl hover:shadow-blue-900/10 hover:-translate-y-1">
                        <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-white/80 text-xl">dark_mode</span>
                                <h3 className="text-white font-black text-base uppercase tracking-tight">
                                    {latestEvening ? latestEvening.date : 'Ruta Vespertina (RV)'}
                                </h3>
                            </div>
                            <span className="bg-white/20 backdrop-blur-md text-white text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest border border-white/10">
                                MÁS RECIENTE
                            </span>
                        </div>
                        <div className="p-6">
                            {latestEvening ? (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
                                                    <th className="pb-3 text-left font-black text-slate-400 uppercase">Repartidor</th>
                                                    <th className="pb-3 text-right font-black text-slate-400 uppercase">KM Totales</th>
                                                    <th className="pb-3 text-right font-black text-slate-400 uppercase">KM Ruta</th>
                                                    <th className="pb-3 text-right font-black text-slate-400 uppercase">Total de Clientes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {latestEvening.records.map((r, ri) => (
                                                    <tr key={ri} className="group hover:bg-slate-50/80 transition-colors">
                                                        <td className="py-3 font-bold text-slate-700 flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-violet-500"></div>
                                                            {r.driver}
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <span className="font-black text-emerald-600 text-sm bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100/50">
                                                                {r.totalKm}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <span className="font-black text-blue-600 text-sm bg-blue-50 px-2 py-1 rounded-lg">
                                                                {r.routeKm}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <span className="text-slate-900 font-black">{r.customers}</span>
                                                                <span className="text-[10px] font-bold text-slate-300">clientes</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="mt-6 pt-4 border-t border-slate-50 flex justify-between items-center">
                                        <div className="flex gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-300 uppercase">Total KM</span>
                                                <span className="text-xs font-bold text-slate-600">{latestEvening.records.reduce((s, r) => s + (r.routeKm || 0), 0)} km</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-300 uppercase">Total Clientes</span>
                                                <span className="text-xs font-bold text-slate-600">{latestEvening.records.reduce((s, r) => s + (r.customers || 0), 0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-12">
                                    <span className="material-symbols-outlined text-4xl text-slate-300">nights_stay</span>
                                    <p className="text-slate-400 text-sm font-semibold mt-2">No hay capturas vespertinas este mes</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bloque Matutino (Derecha) */}
                    <div className="bg-white rounded-[2rem] shadow-xl shadow-blue-900/5 border border-slate-100 overflow-hidden transition-all hover:shadow-2xl hover:shadow-blue-900/10 hover:-translate-y-1">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-white/80 text-xl">light_mode</span>
                                <h3 className="text-white font-black text-base uppercase tracking-tight">
                                    {latestMorning ? latestMorning.date : 'Ruta Matutina (RM)'}
                                </h3>
                            </div>
                            <span className="bg-white/20 backdrop-blur-md text-white text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest border border-white/10">
                                ANTERIOR
                            </span>
                        </div>
                        <div className="p-6">
                            {latestMorning ? (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
                                                    <th className="pb-3 text-left font-black text-slate-400 uppercase">Repartidor</th>
                                                    <th className="pb-3 text-right font-black text-slate-400 uppercase">KM Totales</th>
                                                    <th className="pb-3 text-right font-black text-slate-400 uppercase">KM Ruta</th>
                                                    <th className="pb-3 text-right font-black text-slate-400 uppercase">Total de Clientes</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {latestMorning.records.map((r, ri) => (
                                                    <tr key={ri} className="group hover:bg-slate-50/80 transition-colors">
                                                        <td className="py-3 font-bold text-slate-700 flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                                            {r.driver}
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <span className="font-black text-emerald-600 text-sm bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100/50">
                                                                {r.totalKm}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <span className="font-black text-blue-600 text-sm bg-blue-50 px-2 py-1 rounded-lg">
                                                                {r.routeKm}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <span className="text-slate-900 font-black">{r.customers}</span>
                                                                <span className="text-[10px] font-bold text-slate-300">clientes</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="mt-6 pt-4 border-t border-slate-50 flex justify-between items-center">
                                        <div className="flex gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-300 uppercase">Total KM</span>
                                                <span className="text-xs font-bold text-slate-600">{latestMorning.records.reduce((s, r) => s + (r.routeKm || 0), 0)} km</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-300 uppercase">Total Clientes</span>
                                                <span className="text-xs font-bold text-slate-600">{latestMorning.records.reduce((s, r) => s + (r.customers || 0), 0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-12">
                                    <span className="material-symbols-outlined text-4xl text-slate-300">sunny</span>
                                    <p className="text-slate-400 text-sm font-semibold mt-2">No hay capturas matutinas este mes</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats as Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[
                    { id: 'totalKm', label: 'KM Totales', val: stats.totalKm.toLocaleString(), unit: 'km', icon: 'speed', color: 'emerald' },
                    { id: 'routeKm', label: 'KM en Ruta', val: stats.totalRouteKm.toLocaleString(), unit: 'km', icon: 'map', color: 'blue' },
                    { id: 'customers', label: 'Total de Clientes', val: stats.totalCustomers, unit: 'clientes', icon: 'groups', color: 'amber' },
                ].map((s) => (
                    <button 
                        key={s.id} 
                        onClick={() => setActiveMetric(s.id as any)}
                        className={`text-left p-5 rounded-2xl transition-all duration-300 border ${activeMetric === s.id 
                            ? `bg-white border-${s.color}-500 shadow-xl shadow-${s.color}-900/10 ring-2 ring-${s.color}-500/20 -translate-y-1` 
                            : 'bg-white border-slate-100 shadow-sm hover:border-slate-300 hover:shadow-md'}`}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <span className={`material-symbols-outlined text-${s.color}-600 bg-${s.color}-50 p-2 rounded-lg`}>{s.icon}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <h2 className="text-2xl font-black text-slate-900">{s.val}</h2>
                            <span className="text-xs font-bold text-slate-400">{s.unit}</span>
                        </div>
                    </button>
                ))}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl mb-6 font-bold flex items-center gap-3">
                    <span className="material-symbols-outlined">warning</span>
                    {error}
                </div>
            )}

            {viewMode === 'charts' ? (
                <div className="flex flex-col gap-8">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                        <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                            <span className="material-symbols-outlined text-blue-600 bg-blue-50 p-2 rounded-xl">show_chart</span>
                            Tendencia Diaria: {activeMetric === 'totalKm' ? 'KM Totales' : activeMetric === 'routeKm' ? 'KM en Ruta' : 'Total de Clientes'}
                        </h3>
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dailyChartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{fontSize: 11, fontWeight: 600, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <YAxis tick={{fontSize: 11, fontWeight: 600, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                                        itemStyle={{fontWeight: '900', fontSize: '14px'}}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey={activeMetric} 
                                        stroke={activeMetric === 'customers' ? '#f59e0b' : activeMetric === 'totalKm' ? '#10b981' : '#3b82f6'} 
                                        strokeWidth={4} 
                                        fill={activeMetric === 'customers' ? '#f59e0b' : activeMetric === 'totalKm' ? '#10b981' : '#3b82f6'} 
                                        fillOpacity={0.1} 
                                        name={activeMetric === 'totalKm' ? 'KM Totales' : activeMetric === 'routeKm' ? 'KM en Ruta' : 'Total de Clientes'} 
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                        <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                            <span className="material-symbols-outlined text-blue-600 bg-blue-50 p-2 rounded-xl">leaderboard</span>
                            Ranking por {activeMetric === 'totalKm' ? 'KM Totales' : activeMetric === 'routeKm' ? 'KM en Ruta' : 'Total de Clientes'}
                        </h3>
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={driverChartData} layout="vertical" margin={{ left: 40, right: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12, fontWeight: 800, fill: '#1e293b'}} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                                    />
                                    <Bar dataKey="value" fill={activeMetric === 'customers' ? '#f59e0b' : activeMetric === 'totalKm' ? '#10b981' : '#3b82f6'} radius={[0, 10, 10, 0]} name={activeMetric === 'totalKm' ? 'KM Totales' : activeMetric === 'routeKm' ? 'KM en Ruta' : 'Total de Clientes'}>
                                        <LabelList dataKey="value" position="right" style={{ fontSize: '12px', fontWeight: '900', fill: '#1e293b' }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Repartidor</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">KM Totales</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">KM Ruta</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Total de Clientes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {data.flatMap((day, dIdx) => 
                                    day.records.map((record, rIdx) => (
                                        <tr key={`${dIdx}-${rIdx}`} className="hover:bg-blue-50/50">
                                            <td className="px-6 py-4 font-mono text-[10px]">{day.date}</td>
                                            <td className="px-6 py-4 font-bold text-slate-700">{record.driver}</td>
                                            <td className="px-6 py-4 text-right font-black text-emerald-600">{record.totalKm} km</td>
                                            <td className="px-6 py-4 text-right font-black text-blue-600">{record.routeKm} km</td>
                                            <td className="px-6 py-4 text-right text-slate-500 font-bold">{record.customers}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MileageDashboard;
