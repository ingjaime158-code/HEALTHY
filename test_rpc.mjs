import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    // try to get public details of a random trip or see if RPC exists
    const { data: trips } = await supabase.from('trips').select('id').limit(1);
    if (trips && trips.length > 0) {
        const id = trips[0].id;
        const { data, error } = await supabase.rpc('get_public_trip_details', { p_trip_id: id });
        console.log("Details:", data, error);
        
        // try to test confirmTripCost
        const res = await supabase.rpc('confirm_trip_cost', { p_trip_id: id, p_confirmed_by_name: 'Test' });
        console.log("Confirm:", res);
    } else {
        console.log("No trips found.");
    }
}
test();
