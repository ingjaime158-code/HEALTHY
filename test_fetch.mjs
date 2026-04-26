import fs from 'fs';

const envPath = 'I:/APLICACIONES/PROYECTO HEALTHY DREAMS/frontend/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const getHeaders = () => {
    const supabaseServiceKey = env.VITE_SUPABASE_SERVICE_ROLE || env.VITE_SUPABASE_SERVICE_ROL;
    return {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    };
};

async function testAdminSelect() {
    const supabaseUrl = env.VITE_SUPABASE_URL;
    const url = `${supabaseUrl}/rest/v1/drivers?select=*`;
    console.log("Fetching URL:", url);
    
    const res = await fetch(url, { headers: getHeaders() });
    console.log("Status:", res.status);
    
    if (!res.ok) {
        console.error("ERROR TEXT:", await res.text());
    } else {
        const json = await res.json();
        console.log(`Fetched ${json.length} drivers.`);
        if (json.length > 0) {
            console.log("First driver keys:", Object.keys(json[0]));
        }
    }
}

testAdminSelect();
