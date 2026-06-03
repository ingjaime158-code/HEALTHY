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

function normalizeName(name) {
    if (!name) return '';
    return name.toString().toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
      .replace(/[^A-Z]/g, '') // conservar SOLO letras para maxima coincidencia difusa
      .trim();
}

async function check() {
    console.log('--- BUSCANDO DUPLICADOS ACTIVOS EN RUTA MATUTINA ---');
    const { data: businesses, error } = await supabase.from('businesses').select('*').eq('route_type', 'Matutina');
    if (error) {
        console.error(error.message);
        return;
    }
    
    const activeMorning = [];
    businesses.forEach(b => {
        let isActive = true;
        try {
            const parsed = JSON.parse(b.email);
            isActive = parsed.isActive !== false;
        } catch(e){}
        
        if (isActive) {
            activeMorning.push(b);
        }
    });
    
    console.log(`Clientes activos en Ruta Matutina en la BD: ${activeMorning.length}`);
    
    const groups = {};
    activeMorning.forEach(b => {
        // Normalizar nombre quitando emojis, números e indicaciones como LUNES, JUEVES
        const cleanName = normalizeName(b.name.replace(/‼️.*/g, '').replace(/JUEVES/g, '').replace(/LUNES/g, ''));
        if (!groups[cleanName]) groups[cleanName] = [];
        groups[cleanName].push(b);
    });
    
    let dupCount = 0;
    for (const [name, list] of Object.entries(groups)) {
        if (list.length > 1) {
            dupCount++;
            console.log(`\n👥 Posible duplicado activo: "${name}" (${list.length} registros)`);
            list.forEach(b => {
                console.log(`   ID: ${b.id}`);
                console.log(`   Name: "${b.name}"`);
                console.log(`   Location: "${b.location}"`);
                console.log(`   Config: ${b.email}`);
            });
        }
    }
    
    console.log(`\nTotal de grupos duplicados activos encontrados: ${dupCount}`);
}

check();
