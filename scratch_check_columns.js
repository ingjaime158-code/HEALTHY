import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_SERVICE_ROL || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching one row from businesses...");
  const { data, error } = await supabase.from('businesses').select('*').limit(1);
  if (error) {
    console.error("Select failed:", error);
  } else {
    console.log("Keys in returned business object:", Object.keys(data[0] || {}));
    console.log("Sample business row data:", data[0]);
  }
}

run().catch(console.error);
