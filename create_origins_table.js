import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTable() {
  console.log('Verifying table...');
  const { error } = await supabase.rpc('execute_sql', {
    sql_query: `
      CREATE TABLE IF NOT EXISTS public.business_origins (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
          name VARCHAR NOT NULL,
          address TEXT,
          lat DECIMAL(10, 6) NOT NULL,
          lng DECIMAL(10, 6) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE public.business_origins ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Enable read access for all users" ON public.business_origins;
      CREATE POLICY "Enable read access for all users" ON public.business_origins FOR SELECT USING (true);

      DROP POLICY IF EXISTS "Enable insert for all users" ON public.business_origins;
      CREATE POLICY "Enable insert for all users" ON public.business_origins FOR INSERT WITH CHECK (true);

      DROP POLICY IF EXISTS "Enable update for all users" ON public.business_origins;
      CREATE POLICY "Enable update for all users" ON public.business_origins FOR UPDATE USING (true) WITH CHECK (true);

      DROP POLICY IF EXISTS "Enable delete for all users" ON public.business_origins;
      CREATE POLICY "Enable delete for all users" ON public.business_origins FOR DELETE USING (true);
    `
  });

  if (error) {
    console.error('Failed via RPC (might not exist):', error);
  } else {
    console.log('Success via RPC!');
  }
}

createTable();
