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
  // Check triggers on businesses table
  console.log("Checking triggers on businesses table...");
  const sqlTrig = `
    SELECT trigger_name, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'businesses';
  `;
  const { data: trigData, error: trigError } = await supabase.rpc('execute_sql', { sql_query: sqlTrig });
  if (trigError) {
    console.error("Triggers check failed:", trigError);
  } else {
    console.log(JSON.stringify(trigData, null, 2));
  }

  // Check columns of businesses table
  console.log("\nChecking columns of businesses table...");
  const sqlCols = `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'businesses';
  `;
  const { data: colsData, error: colsError } = await supabase.rpc('execute_sql', { sql_query: sqlCols });
  if (colsError) {
    console.error("Columns check failed:", colsError);
  } else {
    console.log(JSON.stringify(colsData, null, 2));
  }
}

run().catch(console.error);
