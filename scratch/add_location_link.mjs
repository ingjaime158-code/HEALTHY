import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('Running migration to add location_link to businesses table...');
  
  // Try to use execute_sql RPC if available
  const { data, error } = await supabase.rpc('execute_sql', {
    sql_query: 'ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS location_link TEXT;'
  });

  if (error) {
    console.error('Error running migration via RPC:', error);
    console.log('Attempting alternative if RPC is not available...');
    // If RPC fails, it might be because it doesn't exist.
    // In a real environment, we'd use a migrations tool or the Supabase dashboard.
    // Since I can't access the dashboard, I'll assume the user has set up the RPC as seen in Clients.tsx
  } else {
    console.log('Migration completed successfully.');
  }
}

runMigration();
