import pg from 'pg';
const { Client } = pg;
const connectStr = 'postgresql://postgres:ctmguadalupe2025!!..@db.cgngdeaknmqvyprfayll.supabase.co:5432/postgres';

async function run() {
    const c = new Client(connectStr);
    await c.connect();
    
    // We update both get_public_trip_details and confirm_trip_cost just to be extremely safe, 
    // and make sure they have SECURITY DEFINER privileges so they bypass RLS.
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
    console.log("Functions updated successfully with SECURITY DEFINER privileges.");
    await c.end();
}
run().catch(console.error);
