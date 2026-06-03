import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envPath = './.env';
let envContent = '';
try {
    envContent = fs.readFileSync(envPath, 'utf8');
} catch (err) {
    console.error(err.message);
    process.exit(1);
}

const env = {};
envContent.split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL);

async function list() {
    const { data: dbClients, error } = await supabase.from('businesses').select('*').eq('route_type', 'Matutina');
    if (error) {
        console.error(error.message);
        return;
    }
    
    const active = [];
    dbClients.forEach(c => {
        let isActive = true;
        try {
            const parsed = JSON.parse(c.email);
            isActive = parsed.isActive !== false;
        } catch(e){}
        if (isActive) active.push(c);
    });
    
    console.log(`--- TOTAL ACTIVOS EN SUPABASE (MATUTINA): ${active.length} ---`);
    active.forEach((c, idx) => {
        let driver = 'SIN ASIGNAR';
        try {
            driver = JSON.parse(c.email).driver || 'SIN ASIGNAR';
        } catch(e){}
        console.log(`[${idx + 1}] ID: ${c.id} | Name: "${c.name}" | Dir: "${c.location}" | Chofer: ${driver}`);
    });
}

list();
