import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

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
    console.log('--- BUSCANDO REGISTROS ESPECÍFICOS ---');
    const { data: businesses, error } = await supabase.from('businesses').select('*');
    if (error) {
        console.error('Error fetching businesses:', error.message);
        return;
    }
    
    const targets = ['ANTIGRAVITY', 'LAGUNAS', 'ADALIA'];
    
    businesses.forEach(b => {
        const match = targets.some(t => b.name.toUpperCase().includes(t));
        if (match) {
            console.log('\n=======================================');
            console.log(`ID: ${b.id}`);
            console.log(`Nombre: ${b.name}`);
            console.log(`Ruta: ${b.route_type}`);
            console.log(`Dirección (location): ${b.location}`);
            console.log(`Link: ${b.location_link || b.locationLink}`);
            console.log(`Coordenadas: Lat: ${b.lat}, Lng: ${b.lng}`);
            console.log(`Email JSON Config: ${b.email}`);
        }
    });
}

diagnose();
