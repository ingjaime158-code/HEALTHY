import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../frontend/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('Running database migration...');
  
  const sql = `
    -- Add location_link if missing
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='location_link') THEN
        ALTER TABLE businesses ADD COLUMN location_link TEXT;
      END IF;
    END $$;

    -- Add route_type if missing
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='route_type') THEN
        ALTER TABLE businesses ADD COLUMN route_type VARCHAR;
      END IF;
    END $$;
  `;

  const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql });

  if (error) {
    console.error('Migration failed:', error);
    console.log('\nIf "execute_sql" function is missing, you may need to add columns manually in Supabase SQL Editor:');
    console.log('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS location_link TEXT;');
    console.log('ALTER TABLE businesses ADD COLUMN IF NOT EXISTS route_type VARCHAR;');
  } else {
    console.log('Migration successful or columns already exist.');
  }
}

runMigration();
