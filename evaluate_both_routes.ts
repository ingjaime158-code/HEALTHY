import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { calculateMatrixRouteDistance } from './src/utils/routeOptimizer';

const envPath = 'I:/APLICACIONES/PROYECTO HEALTHY DREAMS/frontend/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env: any = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

async function run() {
    const driverName = 'BRAYAN';
    const { data: clients } = await supabase.from('businesses').select('*');
    if (!clients) return;

    const parsedClients = clients.map(biz => {
        let driver = 'SIN ASIGNAR';
        let routeType = '';
        let isActive = true;
        let routeOrder = 9999;
        if (biz.email && biz.email.startsWith('{') && biz.email.endsWith('}')) {
            try {
                const parsed = JSON.parse(biz.email);
                driver = parsed.driver || 'SIN ASIGNAR';
                isActive = parsed.isActive !== false;
                routeOrder = parsed.routeOrder !== undefined ? Number(parsed.routeOrder) : 9999;
            } catch (e) {}
        }
        return { id: biz.id, name: biz.name, lat: biz.lat, lng: biz.lng, driver, isActive, routeOrder };
    });

    const driverStops = parsedClients.filter(c => c.isActive && c.driver.trim().toUpperCase() === driverName);
    driverStops.sort((a, b) => a.routeOrder - b.routeOrder);
    const validStops = driverStops.filter(s => s.lat && s.lng);

    const selectedOriginCoords = { lat: 25.781917, lng: -100.191302 };

    // Query OSRM table
    const points = [
        selectedOriginCoords,
        ...validStops.map(s => ({ lat: s.lat, lng: s.lng }))
    ];
    const coordinatesStr = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `http://localhost:5000/table/v1/driving/${coordinatesStr}?annotations=distance`;

    const res = await fetch(url);
    const data = await res.json();
    const distanceMatrix = data.distances;

    console.log("Stops mapping:");
    validStops.forEach((s, i) => {
        console.log(`  ${i+1}: ${s.name}`);
    });

    // Sequence 1: TS Solver (which goes West immediately to Brenda Gladis, then ends in Kiara Mata)
    // 1: Miguel Andre (idx 1)
    // 2: Luis Aguilar (idx 2)
    // 3: Brenda Gladis (idx 14)
    // 4: Luis Carlos (idx 15)
    // 5: Richard García (idx 13)
    // 6: Benjamín Mondragón (idx 12)
    // 7: Melany Dayanna (idx 9)
    // 8: Miguel Ángel (idx 10)
    // 9: Melany Herrera (idx 11)
    // 10: Maria Ines (idx 8)
    // 11: Joel Arturo (idx 7)
    // 12: Benjamin López (idx 6)
    // 13: Ricardo Bermúdez (idx 5)
    // 14: Victor Manuel (idx 4)
    // 15: Kiara Mata (idx 3)
    const seqTS = [1, 2, 14, 15, 13, 12, 9, 10, 11, 8, 7, 6, 5, 4, 3];
    const distTS = calculateMatrixRouteDistance(seqTS, distanceMatrix, false);
    console.log(`\nSequence TS (West First, End at Kiara Mata) Distance: ${distTS} meters`);

    // Sequence 2: Old Local System (which goes South to Kiara Mata/Victor Manuel first, then ends at Luis Carlos Marin in West)
    // 1: Miguel Andre (idx 1)
    // 2: Luis Aguilar (idx 2)
    // 3: Kiara Mata (idx 3)
    // 4: Victor Manuel (idx 4)
    // 5: Ricardo Bermúdez (idx 5)
    // 6: Benjamin López (idx 6)
    // 7: Joel Arturo (idx 7)
    // 8: Maria Ines (idx 8)
    // 9: Melany Dayanna (idx 9)
    // 10: Miguel Ángel (idx 10)
    // 11: Melany Herrera (idx 11)
    // 12: Benjamín Mondragón (idx 12)
    // 13: Richard García (idx 13)
    // 14: Brenda Gladis (idx 14)
    // 15: Luis Carlos Marin (idx 15)
    const seqOld = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const distOld = calculateMatrixRouteDistance(seqOld, distanceMatrix, false);
    console.log(`Sequence Old Local (South First, End at Luis Carlos) Distance: ${distOld} meters`);
}

run();
