import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, './.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROL;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  const { data: allowedUsers, error: dbError } = await supabase.from('allowed_users').select('*');
  console.log('Allowed Users in DB:', allowedUsers);
  
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  console.log('Auth Users in Supabase:', authUsers.users.map(u => ({ email: u.email, id: u.id })));
}

check();
