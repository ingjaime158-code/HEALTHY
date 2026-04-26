import pg from 'pg';
const { Client } = pg;
const connectStr = 'postgresql://postgres:ctmguadalupe2025!!..@db.cgngdeaknmqvyprfayll.supabase.co:5432/postgres';
async function run() {
    const c = new Client(connectStr);
    await c.connect();
    
    const sql = `
CREATE OR REPLACE FUNCTION get_public_trip_details(p_trip_id UUID)
RETURNS TABLE (
    id UUID,
    origin TEXT,
    destination TEXT,
    cost NUMERIC,
    client_confirmed BOOLEAN,
    status TEXT,
    confirmed_by_name TEXT,
    client_name TEXT,
    created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql 
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id, 
        t.origin, 
        t.destination, 
        t.cost, 
        t.client_confirmed, 
        t.status,
        t.confirmed_by_name,
        COALESCE(b.name, t.passenger_name, 'No especificado') as client_name,
        t.created_at
    FROM trips t
    LEFT JOIN businesses b ON t.business_id = b.id
    WHERE t.id = p_trip_id;
END;
$$;
ALTER FUNCTION get_public_trip_details(UUID) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION get_public_trip_details(UUID) TO public;
GRANT EXECUTE ON FUNCTION get_public_trip_details(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_public_trip_details(UUID) TO authenticated;
`;
    await c.query(sql);
    console.log("Function updated successfully");
    await c.end();
}
run().catch(console.error);
