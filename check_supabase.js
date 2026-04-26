import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load from .env
const envPath = 'I:/APLICACIONES/PROYECTO HEALTHY DREAMS/frontend/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

async function diagnose() {
    console.log('--- DIAGNÓSTICO PROFUNDO HEALTHY DREAMS ---');
    
    // 1. Verificar conteos
    const tables = ['drivers', 'destinations', 'allowed_users', 'businesses'];
    for (const table of tables) {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) console.error(`Error en [${table}]:`, error.message);
        else console.log(`Tabla [${table}]: ${count} registros.`);
    }

    // 2. Verificar estructura de 'destinations' (Mapas)
    console.log('\n--- ESTRUCTURA DE DESTINATIONS ---');
    const { data: destSample, error: destErr } = await supabase.from('destinations').select('*').limit(1);
    if (destErr) console.error('Error al leer destinations:', destErr.message);
    else console.log('Muestra Destinations:', destSample[0]);

    // 3. Verificar estructura de 'drivers' (Repartidores)
    console.log('\n--- ESTRUCTURA DE DRIVERS ---');
    const { data: driveSample, error: driveErr } = await supabase.from('drivers').select('*').limit(1);
    if (driveErr) console.error('Error al leer drivers:', driveErr.message);
    else console.log('Muestra Drivers:', driveSample[0]);
}

diagnose();
