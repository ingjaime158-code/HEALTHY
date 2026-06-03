import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Direct connection string to the pwquntnvqwdcrmtjgedb database
const connectStr = 'postgresql://postgres:ctmguadalupe2025!!..@db.pwquntnvqwdcrmtjgedb.supabase.co:5432/postgres';

async function run() {
    console.log("Connecting directly to PostgreSQL db.pwquntnvqwdcrmtjgedb.supabase.co:5432...");
    
    const c = new Client({ 
        connectionString: connectStr,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        await c.connect();
        console.log("Connected successfully!");

        console.log("Reading SQL migration file...");
        const sqlPath = path.join(__dirname, '../supabase/migrations/20260529_migrate_businesses_columns.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log("Executing SQL migration script...");
        await c.query(sql);
        console.log("Migration executed successfully!");
        
        console.log("Reloading PostgREST schema cache to expose the new columns...");
        await c.query("NOTIFY pgrst, 'reload config';");
        console.log("PostgREST schema reloaded successfully!");
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    } finally {
        await c.end();
        process.exit(0);
    }
}

run();
