import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    // Update confirm_trip_cost to preserve 'Programado' status for scheduled trips
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
        status = CASE 
            WHEN scheduled_at IS NOT NULL THEN 'Programado'
            ELSE 'En Progreso'
        END,
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

    // Try executing via rpc if available, otherwise just print for manual execution
    const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
    if (error) {
        console.log("Could not run via exec_sql RPC (expected). SQL to run manually:");
        console.log(sql);
        console.log("\n--- Attempting alternative approach ---");
        
        // Try direct query approach using management key if available
        // For now let's just output the SQL
    } else {
        console.log("Function updated successfully!");
    }
}

run();
