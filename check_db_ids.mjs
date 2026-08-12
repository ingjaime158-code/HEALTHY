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

// Names in sheet order
const sheetNames = [
    "Lucía Francisca Delgado Gzz",
    "Marco Eduardo Rodríguez Gomez",
    "Jenny Adame Vargas y Johana Medina Gzz",
    "Lizbeth Jiménez Contreras",
    "Andrea Enciso Beltrán & Ricardo Mendoza Gómez",
    "Jose Antonio Guillen",
    "Marisbel Rosas Hdz",
    "Gabriel Macías Godoy",
    "Carlos Adrián Pérez Chavarria",
    "Paulina Aguilera Faz y Carlos Javier Elizondo",
    "Jacqueline Hay & Cynthia Garza",
    "Ricardo Terrazas",
    "Jose Jaime Carrillo",
    "Ana Elia Guerra Escamilla",
    "Cinthia González Regalado",
    "Juan Antonio Reyes",
    "Ivar Cach Junco"
];

async function run() {
    console.log("Fetching client IDs from Supabase...");
    const { data, error } = await supabase
        .from('businesses')
        .select('id, name, created_at');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("\n=== CLIENTS IN SHEET ORDER WITH THEIR DATABASE DETAILS ===");
    sheetNames.forEach((name, idx) => {
        const matched = data.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (matched) {
            console.log(`${idx + 1}: ID: "${matched.id}" | CreatedAt: "${matched.created_at}" | Name: "${matched.name}"`);
        } else {
            console.log(`${idx + 1}: ❌ NOT FOUND: "${name}"`);
        }
    });

    console.log("\n=== DATABASE CLIENTS SORTED BY ID ===");
    const matchedList = sheetNames.map(name => data.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase())).filter(Boolean);
    matchedList.sort((a, b) => a.id.localeCompare(b.id));
    matchedList.forEach((c, idx) => {
        console.log(`${idx + 1}: ID: "${c.id}" | Name: "${c.name}"`);
    });
}
run();
