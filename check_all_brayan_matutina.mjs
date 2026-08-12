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
    console.log("Fetching active Matutina clients for BRAYAN...");
    const { data, error } = await supabase
        .from('businesses')
        .select('id, name, lat, lng, email, route_type');

    if (error) {
        console.error("Error:", error);
        return;
    }

    const brayanClients = [];
    data.forEach(c => {
        try {
            const config = JSON.parse(c.email);
            if (config.driver && config.driver.trim().toUpperCase() === 'BRAYAN' && config.isActive === true && c.route_type === 'Matutina') {
                brayanClients.push({
                    id: c.id,
                    name: c.name,
                    lat: c.lat,
                    lng: c.lng,
                    routeOrder: config.routeOrder !== undefined ? Number(config.routeOrder) : 9999
                });
            }
        } catch (e) {}
    });

    console.log(`\n=== ACTIVE BRAYAN MATUTINA CLIENTS (Total: ${brayanClients.length}) ===`);
    brayanClients.sort((a, b) => a.routeOrder - b.routeOrder);

    brayanClients.forEach((c, idx) => {
        console.log(`${idx+1}: Order: ${c.routeOrder} - Name: "${c.name}" (${c.lat}, ${c.lng})`);
    });
}
run();
