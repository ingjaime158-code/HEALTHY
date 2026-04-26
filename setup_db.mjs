import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, './.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROL;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setup() {
  console.log('Connecting to Supabase...');
  
  const email = 'jimmy@healthydreams.com';
  const password = 'Leon_1580';

  console.log(`Creating/Updating user in Auth: ${email}`);
  
  // 1. Create user in Supabase Auth (using admin API)
  const { data: userData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
        console.log('User already exists in Auth, updating password...');
        // Find user id first
        const { data: list } = await supabase.auth.admin.listUsers();
        const existingUser = list.users.find(u => u.email === email);
        if (existingUser) {
            await supabase.auth.admin.updateUserById(existingUser.id, { password });
        }
    } else {
        console.error('Error creating user in Auth:', authError);
        // continue anyway to try to add to allowed_users
    }
  }

  // 2. Add to allowed_users table
  const masterUser = {
    email,
    role: 'Administrador',
    name: 'JIMMY'
  };

  console.log(`Upserting user in allowed_users: ${email}`);
  
  const { error: dbError } = await supabase
    .from('allowed_users')
    .upsert(masterUser, { onConflict: 'email' });

  if (dbError) {
    console.error('Error upserting user in DB:', dbError);
    process.exit(1);
  }

  console.log('User JIMMY setup successfully!');
}

setup();
