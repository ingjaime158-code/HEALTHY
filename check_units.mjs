import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let supabaseUrl = process.env.VITE_SUPABASE_URL;
let supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  const envContent = fs.readFileSync('.env', 'utf8');
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
  const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim();
  if (keyMatch) supabaseKey = keyMatch[1].trim();
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectUsers() {
  const { data: users, error } = await supabase.from('allowed_users').select('*').limit(5);
  if (error) {
    console.error("Error reading allowed_users:", error.message);
  } else {
    console.log("ALLOWED_USERS:");
    console.log(JSON.stringify(users, null, 2));
  }
}

inspectUsers();
