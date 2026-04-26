
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_SERVICE_ROL;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkAuthUsers() {
  console.log("--- Diagnóstico de Usuarios en Auth ---");
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error("Error al listar usuarios de Auth:", error.message);
    return;
  }

  console.log(`Total de usuarios encontrados en Auth: ${users.length}`);
  users.forEach(u => {
    console.log(`- Email: ${u.email} | Confirmado: ${u.email_confirmed_at ? 'SÍ' : 'NO'} | ID: ${u.id}`);
  });
  
  console.log("\n--- Diagnóstico de Tabla allowed_users ---");
  const { data: allowed, error: err2 } = await supabase.from('allowed_users').select('*');
  if (err2) {
    console.error("Error en allowed_users:", err2.message);
  } else {
    console.log(`Usuarios en allowed_users: ${allowed.length}`);
    allowed.forEach(a => {
      console.log(`- ${a.email} (${a.role})`);
    });
  }
}

checkAuthUsers();
