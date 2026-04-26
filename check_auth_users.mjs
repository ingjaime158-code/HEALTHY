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

async function checkUsers() {
    console.log('--- VERIFICANDO USUARIOS PERMITIDOS ---');
    const { data, error } = await supabase.from('allowed_users').select('email, role, name');
    
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Usuarios autorizados para entrar al panel:');
        data.forEach(u => console.log(`- ${u.email} (Rol: ${u.role})`));
    }
}

checkUsers();
