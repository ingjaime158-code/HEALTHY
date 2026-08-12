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

const clientNames = [
    'Lucía Francisca Delgado Gzz',
    'Marco Eduardo Rodríguez Gomez',
    'Jenny Adame Vargas y Johana Medina Gzz',
    'Lizbeth Jiménez Contreras',
    'Andrea Enciso Beltrán & Ricardo Mendoza Gómez',
    'Jose Antonio Guillen',
    'Marisbel Rosas Hdz',
    'Gabriel Macías Godoy',
    'Carlos Adrián Pérez Chavarria',
    'Paulina Aguilera Faz y Carlos Javier Elizondo',
    'Jacqueline Hay & Cynthia Garza'
];

async function run() {
    console.log("Fetching client coordinates from Supabase...");
    const { data, error } = await supabase
        .from('businesses')
        .select('id, name, lat, lng, email');

    if (error) {
        console.error("Error fetching from DB:", error);
        return;
    }

    clientNames.forEach(name => {
        const matched = data.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (matched) {
            console.log(`DB match: "${matched.name}"`);
            console.log(`  Coordinates: (${matched.lat}, ${matched.lng})`);
            try {
                const config = JSON.parse(matched.email);
                console.log(`  config.routeOrder: ${config.routeOrder}`);
                console.log(`  config.driver: ${config.driver}`);
            } catch (e) {
                console.log(`  Failed to parse config: ${matched.email}`);
            }
        } else {
            console.log(`❌ No match in DB for "${name}"`);
        }
    });
}
run();
