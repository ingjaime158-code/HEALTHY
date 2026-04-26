import fs from 'fs';
import pg from 'pg';
const { Client } = pg;
const connectStr = 'postgresql://postgres.cgngdeaknmqvyprfayll:ctmguadalupe2025!!..@aws-0-us-west-1.pooler.supabase.com:6543/postgres';
async function run() {
    const c = new Client({ connectionString: connectStr, ssl: { rejectUnauthorized: false }});
    await c.connect();
    const sql = fs.readFileSync('../backend/database/fix_scheduling_wait.sql', 'utf8');
    await c.query(sql);
    console.log("Migration successful");
    await c.end();
}
run();
