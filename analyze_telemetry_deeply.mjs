import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

async function analyze() {
    console.log("=== ANÁLISIS DE TELEMETRÍA Y APRENDIZAJE DEL SISTEMA ===");

    // Fetch all records
    let { data, error } = await supabase
        .from('route_distribution_telemetry')
        .select('*')
        .order('created_at', { ascending: true });

    if (error || !data) {
        console.error("Error fetching telemetry:", error);
        return;
    }

    console.log(`Total de instantáneas de telemetría capturadas: ${data.length}`);

    const firstDate = data[0]?.created_at;
    const lastDate = data[data.length - 1]?.created_at;
    console.log(`Primer registro: ${firstDate}`);
    console.log(`Último registro: ${lastDate}`);

    // Route types count
    const routeTypes = {};
    const driverAssignments = {};
    const clientDriverFreq = {}; // client -> driver -> count
    const datesSet = new Set();

    data.forEach(rec => {
        routeTypes[rec.route_type] = (routeTypes[rec.route_type] || 0) + 1;
        if (rec.route_date) datesSet.add(rec.route_date);

        const clients = rec.clients_data || [];
        if (Array.isArray(clients)) {
            clients.forEach(c => {
                const driver = c.driver || c.driver_name || 'SIN ASIGNAR';
                const clientName = c.name || c.business_name || c.id || 'DESCONOCIDO';

                if (driver !== 'SIN ASIGNAR') {
                    driverAssignments[driver] = (driverAssignments[driver] || 0) + 1;

                    if (!clientDriverFreq[clientName]) clientDriverFreq[clientName] = {};
                    clientDriverFreq[clientName][driver] = (clientDriverFreq[clientName][driver] || 0) + 1;
                }
            });
        }
    });

    console.log(`\nNúmero de días únicos registrados: ${datesSet.size}`);
    console.log("\nDesglose por tipo de ruta:", routeTypes);
    console.log("\nAsignaciones acumuladas por Chofer en la telemetría:");
    console.table(driverAssignments);

    // Analyze pattern strength (how consistent client-driver pairings are)
    let totalClientsWithData = 0;
    let highConsistencyClients = 0; // >80% to same driver

    for (const [client, dMap] of Object.entries(clientDriverFreq)) {
        totalClientsWithData++;
        let maxCount = 0;
        let totalCount = 0;
        for (const [d, count] of Object.entries(dMap)) {
            totalCount += count;
            if (count > maxCount) maxCount = count;
        }
        if (totalCount >= 3 && (maxCount / totalCount) >= 0.8) {
            highConsistencyClients++;
        }
    }

    console.log(`\nAnálisis de consistencia de patrones de distribución:`);
    console.log(`Clientes analizados con historial de asignación: ${totalClientsWithData}`);
    console.log(`Clientes con alta consistencia de asignación al mismo chofer (>=80%): ${highConsistencyClients} (${((highConsistencyClients/totalClientsWithData)*100).toFixed(1)}%)`);
}

analyze();
