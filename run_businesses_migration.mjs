import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROL || process.env.VITE_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('Reading migration file...');
  const sqlPath = path.join(__dirname, '../supabase/migrations/20260529_migrate_businesses_columns.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Executing structured column migration on Supabase...');
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql });

  if (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } else {
    console.log('Migration successfully executed! All businesses structured columns have been created and populated.');
    process.exit(0);
  }
}

runMigration();
