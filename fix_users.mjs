import { Client } from 'pg';

const connectStr = 'postgresql://postgres.nndvteymtngzngsrxnln:ctmguadalupe2025!!..@aws-0-us-west-1.pooler.supabase.com:6543/postgres';

async function main() {
  const client = new Client({
    connectionString: connectStr,
  });

  try {
    await client.connect();
    
    // First let's see what users are in the allowed_users table
    const res = await client.query("SELECT * FROM allowed_users");
    console.log("Current Allowed Users:");
    console.table(res.rows);

    // Let's add ridan.rodva@gmail.com as Admin if it doesn't exist
    const emailToAdd = 'ridan.rodva@gmail.com';
    const check = await client.query("SELECT * FROM allowed_users WHERE email ilike $1", [emailToAdd]);
    
    if (check.rows.length === 0) {
      console.log(`\nEmail ${emailToAdd} not found. Inserting...`);
      await client.query("INSERT INTO allowed_users (email, role, name) VALUES ($1, 'Administrador', 'Ridan Rodva')", [emailToAdd]);
      console.log("Insert successful!");
    } else {
      console.log(`\nEmail ${emailToAdd} already exists with role:`, check.rows[0].role);
      if (check.rows[0].role !== 'Administrador') {
         await client.query("UPDATE allowed_users SET role = 'Administrador' WHERE id = $1", [check.rows[0].id]);
         console.log("Updated role to Administrador.");
      }
    }

  } catch (e) {
    console.error("DB Error:", e);
  } finally {
    await client.end();
  }
}

main();
