import pg from 'pg';
const { Client } = pg;
const connectStr = 'postgresql://postgres:ctmguadalupe2025!!..@db.cgngdeaknmqvyprfayll.supabase.co:5432/postgres';
async function run() {
    const c = new Client(connectStr);
    try {
        await c.connect();
        const sql = `ALTER TABLE trips ADD COLUMN IF NOT EXISTS toll_cost NUMERIC(10, 2) DEFAULT 0; NOTIFY pgrst, 'reload config';`;
        await c.query(sql);
        console.log("Migration successful: added toll_cost to trips");
    } finally {
        await c.end();
    }
}
run().catch(console.error);
