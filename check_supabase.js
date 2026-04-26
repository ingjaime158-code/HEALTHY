import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase.from('trips').select('*').limit(1);
    if (error) console.error(error);
    else if (data && data.length) console.log(Object.keys(data[0]));
    else console.log('Trips table is empty but reachable.');
}
run();
