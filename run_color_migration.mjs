import pg from 'pg';
const { Client } = pg;
const connectStr = 'postgresql://postgres:ctmguadalupe2025!!..@db.cgngdeaknmqvyprfayll.supabase.co:5432/postgres';
async function run() {
    const c = new Client(connectStr);
    await c.connect();
    
    const sql = `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS color_hex VARCHAR(7);`;
    await c.query(sql);
    console.log("Column added successfully");
    await c.end();
}
run().catch(console.error);
