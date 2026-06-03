import pg from 'pg';
const { Client } = pg;
const connectStr = 'postgresql://postgres:ctmguadalupe2025!!..@db.pwquntnvqwdcrmtjgedb.supabase.co:5432/postgres';

async function run() {
    const c = new Client({ connectionString: connectStr, ssl: { rejectUnauthorized: false }});
    await c.connect();
    
    // Check triggers on businesses table
    console.log("Checking triggers on businesses table...");
    const resTrig = await c.query(`
        SELECT trigger_name, event_manipulation, action_statement
        FROM information_schema.triggers
        WHERE event_object_table = 'businesses';
    `);
    console.log(JSON.stringify(resTrig.rows, null, 2));

    // Check columns of businesses table
    console.log("\nChecking columns of businesses table...");
    const resCols = await c.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'businesses';
    `);
    console.log(JSON.stringify(resCols.rows, null, 2));

    await c.end();
}
run().catch(console.error);
