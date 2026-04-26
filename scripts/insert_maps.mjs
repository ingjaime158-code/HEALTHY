import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROL || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setup() {
  console.log('Connecting to Supabase...');
  
  const { data, error } = await supabase
    .from('destinations')
    .insert([
      { name: 'Rutas Matutinas', morning_map_url: '', evening_map_url: '', address: '', lat: 0, lng: 0 },
      { name: 'Rutas Vespertinas', morning_map_url: '', evening_map_url: '', address: '', lat: 0, lng: 0 }
    ]);

  if (error) {
      console.error('Error inserting maps:', error);
      process.exit(1);
  }

  console.log('Maps inserted successfully!');
}

setup();
