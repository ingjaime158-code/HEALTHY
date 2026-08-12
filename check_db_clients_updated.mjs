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
    console.log("Fetching active BRAYAN Vespertina clients...");
    const { data, error } = await supabase
        .from('businesses')
        .select('*');

    if (error) {
        console.error(error);
        return;
    }

    const brayanClients = [];
    data.forEach(c => {
        try {
            const config = JSON.parse(c.email);
            if (config.driver && config.driver.trim().toUpperCase() === 'BRAYAN' && config.isActive === true && c.route_type === 'Vespertina') {
                brayanClients.push({
                    id: c.id,
                    name: c.name,
                    config,
                    updated_at: c.updated_at
                });
            }
        } catch (e) {}
    });

    console.log(`Total active BRAYAN Vespertina clients in DB: ${brayanClients.length}`);
    brayanClients.forEach(c => {
        console.log(`Name: "${c.name}", routeOrder: ${c.config.routeOrder}, updated_at: ${c.updated_at || 'none'}`);
    });
}
run();
