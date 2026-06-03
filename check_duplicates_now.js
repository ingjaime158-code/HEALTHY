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

async function check() {
    console.log('--- DUPLICADOS EN LA BD ACTUAL DE SUPABASE ---');
    const { data: businesses, error } = await supabase.from('businesses').select('*');
    if (error) {
        console.error(error.message);
        return;
    }
    
    const counts = {};
    businesses.forEach(b => {
        const name = b.name.toUpperCase().trim();
        if (!counts[name]) counts[name] = [];
        counts[name].push(b);
    });
    
    let dupCount = 0;
    for (const [name, list] of Object.entries(counts)) {
        if (list.length > 1) {
            dupCount++;
            console.log(`\n👥 Duplicado: "${name}" (${list.length} registros)`);
            list.forEach(b => {
                let isActive = true;
                try {
                    const parsed = JSON.parse(b.email);
                    isActive = parsed.isActive !== false;
                } catch(e){}
                console.log(`   ID: ${b.id} | Dir: ${b.location} | Active: ${isActive} | Route: ${b.routeType || b.route_type}`);
            });
        }
    }
    
    console.log(`\nTotal de nombres duplicados en la BD: ${dupCount}`);
}

check();
