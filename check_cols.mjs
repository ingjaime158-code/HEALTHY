import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual env loading for .env.local
const envPath = 'I:/APLICACIONES/PROYECTO HEALTHY DREAMS/frontend/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_SERVICE_ROLE
);

async function checkColumns() {
  const { data: sample, error: sampleError } = await supabase.from('driver_locations').select('*').limit(1);
  if (sampleError) {
    console.error('Error:', sampleError);
  } else {
    console.log('Columnas encontradas:', Object.keys(sample[0] || {}));
  }
}

checkColumns();
