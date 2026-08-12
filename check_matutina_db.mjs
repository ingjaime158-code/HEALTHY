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
    console.log("Fetching active BRAYAN Matutina clients...");
    const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('route_type', 'Matutina');

    if (error) {
        console.error(error);
        return;
    }

    const brayanClients = [];
    data.forEach(c => {
        try {
            const config = JSON.parse(c.email);
            if (config.driver && config.driver.trim().toUpperCase() === 'BRAYAN' && config.isActive === true) {
                brayanClients.push({
                    id: c.id,
                    name: c.name,
                    config,
                    lat: c.lat,
                    lng: c.lng
                });
            }
        } catch (e) {}
    });

    console.log(`Total active BRAYAN Matutina clients in DB: ${brayanClients.length}`);
    brayanClients.sort((a, b) => (a.config.routeOrder || 9999) - (b.config.routeOrder || 9999));
    brayanClients.forEach(c => {
        console.log(`Name: "${c.name}", routeOrder: ${c.config.routeOrder}, coords: ${c.lat}, ${c.lng}`);
    });
}
run();
