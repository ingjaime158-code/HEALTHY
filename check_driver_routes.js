import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envPath = 'I:/APLICACIONES/PROYECTO HEALTHY DREAMS/frontend/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

async function run() {
    console.log("Fetching clients from Supabase...");
    const { data: clients, error } = await supabase.from('businesses').select('*');
    if (error) {
        console.error("Error:", error.message);
        return;
    }

    const parsedClients = clients.map(biz => {
        let driver = 'SIN ASIGNAR';
        let routeType = '';
        let isActive = true;
        let routeOrder = 9999;
        
        if (biz.email && biz.email.startsWith('{') && biz.email.endsWith('}')) {
            try {
                const parsed = JSON.parse(biz.email);
                driver = parsed.driver || 'SIN ASIGNAR';
                routeType = parsed.routeType || '';
                isActive = parsed.isActive !== false;
                routeOrder = parsed.routeOrder !== undefined ? Number(parsed.routeOrder) : 9999;
            } catch (e) {}
        }
        return {
            id: biz.id,
            name: biz.name,
            lat: biz.lat,
            lng: biz.lng,
            driver,
            routeType,
            isActive,
            routeOrder
        };
    });

    const activeClients = parsedClients.filter(c => c.isActive);
    console.log(`Total active clients: ${activeClients.length}`);

    // Group by routeType and driver
    const groups = {};
    activeClients.forEach(c => {
        const key = `${c.routeType} - ${c.driver}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
    });

    console.log("\nActive clients per Route and Driver:");
    Object.keys(groups).sort().forEach(key => {
        const stops = groups[key];
        const stopsWithCoords = stops.filter(s => s.lat && s.lng);
        console.log(`- ${key}: ${stops.length} stops (${stopsWithCoords.length} with valid coordinates)`);
    });
}

run();
