import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROL;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql = `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS color_hex VARCHAR(7);`;
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql });
  if (error) console.error('Migration failed:', error);
  else console.log('Migration successful', data);
}
run();
