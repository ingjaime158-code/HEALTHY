import pg from 'pg';
const { Client } = pg;
const connectStr = 'postgresql://postgres.cgngdeaknmqvyprfayll:ctmguadalupe2025!!..@aws-0-us-west-1.pooler.supabase.com:6543/postgres';
async function run() {
    const c = new Client(connectStr);
    await c.connect();
    const res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'trips'");
    console.log(res.rows);
    await c.end();
}
run().catch(console.error);
