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

async function inspect() {
    console.log("--- Supabase Data Inspection ---");
    
    // Check route_distribution_telemetry count
    const { count: telemetryCount, error: err1 } = await supabase
        .from('route_distribution_telemetry')
        .select('*', { count: 'exact', head: true });
    console.log(`route_distribution_telemetry count: ${telemetryCount} (error: ${err1?.message || 'none'})`);

    // Check route_history count
    const { count: historyCount, error: err2 } = await supabase
        .from('route_history')
        .select('*', { count: 'exact', head: true });
    console.log(`route_history count: ${historyCount} (error: ${err2?.message || 'none'})`);

    // Check driver_locations count
    const { count: locCount, error: err3 } = await supabase
        .from('driver_locations')
        .select('*', { count: 'exact', head: true });
    console.log(`driver_locations count: ${locCount} (error: ${err3?.message || 'none'})`);

    // Check trips count
    const { count: tripsCount, error: err4 } = await supabase
        .from('trips')
        .select('*', { count: 'exact', head: true });
    console.log(`trips count: ${tripsCount} (error: ${err4?.message || 'none'})`);

    // Check businesses count
    const { count: bizCount, error: err5 } = await supabase
        .from('businesses')
        .select('*', { count: 'exact', head: true });
    console.log(`businesses count: ${bizCount} (error: ${err5?.message || 'none'})`);

    // Fetch latest 5 telemetry entries to examine content
    const { data: telemetrySamples } = await supabase
        .from('route_distribution_telemetry')
        .select('id, created_at, route_date, route_type, clients_data')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log("\nRecent Telemetry Snapshots Sample:");
    if (telemetrySamples) {
        telemetrySamples.forEach(t => {
            console.log(`- Snapshot ID: ${t.id} | Date: ${t.route_date} | Type: ${t.route_type} | Clients recorded: ${Array.isArray(t.clients_data) ? t.clients_data.length : 'N/A'}`);
        });
    }
}

inspect();
