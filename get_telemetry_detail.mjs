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

async function run() {
    const targetId = 'bf7c2b0c-5a05-4f20-9997-56ba82436dd7';
    console.log(`Fetching telemetry record ${targetId}...`);
    const { data, error } = await supabase
        .from('route_distribution_telemetry')
        .select('*')
        .eq('id', targetId)
        .single();

    if (error) {
        console.error(error);
        return;
    }

    console.log(`ID: ${data.id}`);
    console.log(`Created At: ${data.created_at}`);
    console.log(`Route Date: ${data.route_date}`);
    console.log(`Route Type: ${data.route_type}`);
    
    const clients = data.clients_data || [];
    console.log(`Total Clients: ${clients.length}`);
    
    // Let's group by driver
    const grouped = {};
    clients.forEach(c => {
        const d = c.driver || 'SIN ASIGNAR';
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(c);
    });
    
    for (const [driver, list] of Object.entries(grouped)) {
        console.log(`\n=== Driver: ${driver} (${list.length} clients) ===`);
        list.forEach((c, idx) => {
            console.log(`${idx + 1}: Name: "${c.name}", order: ${c.routeOrder}, lat: ${c.lat}, lng: ${c.lng}`);
        });
    }
}
run();
