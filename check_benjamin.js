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
    console.log('--- BUSCANDO BENJAMIN Y AARON EN LA BD ---');
    const { data: businesses, error } = await supabase.from('businesses').select('*');
    if (error) {
        console.error(error.message);
        return;
    }
    
    businesses.forEach(b => {
        const name = b.name.toUpperCase();
        if (name.includes('BENJAMIN') || name.includes('BENJAMIN') || name.includes('AARON')) {
            let isActive = true;
            try {
                const parsed = JSON.parse(b.email);
                isActive = parsed.isActive !== false;
            } catch(e){}
            console.log(`ID: ${b.id}`);
            console.log(`Name: "${b.name}"`);
            console.log(`Location: "${b.location}"`);
            console.log(`Route: "${b.routeType || b.route_type}"`);
            console.log(`Active: ${isActive}`);
            console.log(`Config: ${b.email}`);
            console.log('-----------------------------------');
        }
    });
}

check();
