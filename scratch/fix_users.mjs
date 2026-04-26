
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_SERVICE_ROL;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixUsers() {
  const usersToConfirm = ['gris.fer.rg@gmail.com', 'healthy@healthydreams.com'];
  
  for (const email of usersToConfirm) {
    console.log(`Intentando confirmar a ${email}...`);
    // 1. Get user ID
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users.find(u => u.email === email);
    
    if (user) {
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true,
        confirm_ad: true // Force confirm
      });
      if (error) console.error(`Error confirmando ${email}:`, error.message);
      else console.log(`✅ ${email} ha sido confirmado exitosamente.`);
    } else {
      console.log(`❌ No se encontró a ${email} en Auth.`);
    }
  }
}

fixUsers();
