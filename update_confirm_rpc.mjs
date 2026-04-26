import pg from 'pg';
const { Client } = pg;
const connectStr = 'postgresql://postgres.nndvteymtngzngsrxnln:ctmguadalupe2025!!..@aws-0-us-west-1.pooler.supabase.com:6543/postgres';

async function run() {
    const c = new Client(connectStr);
    await c.connect();
    
    const sql = `
CREATE OR REPLACE FUNCTION confirm_trip_cost(p_trip_id UUID, p_confirmed_by_name TEXT)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated BOOLEAN;
BEGIN
    UPDATE trips
    SET client_confirmed = TRUE,
        status = 'En Progreso',
        confirmed_by_name = p_confirmed_by_name
    WHERE id = p_trip_id AND client_confirmed = FALSE
    RETURNING TRUE INTO v_updated;
    
    RETURN COALESCE(v_updated, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_trip_cost(UUID, TEXT) TO public;
GRANT EXECUTE ON FUNCTION confirm_trip_cost(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION confirm_trip_cost(UUID, TEXT) TO authenticated;
`;
    await c.query(sql);
    console.log("Function updated successfully");
    await c.end();
}
run().catch(console.error);
