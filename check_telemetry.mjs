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

async function run() {
    console.log("Fetching all route_distribution_telemetry for today...");
    const { data, error } = await supabase
        .from('route_distribution_telemetry')
        .select('id, created_at, route_date, route_type')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Found ${data.length} telemetry records.`);
    data.forEach(r => {
        console.log(`ID: ${r.id} | Created At: ${r.created_at} | Date: ${r.route_date} | Type: ${r.route_type}`);
    });
}
run();
