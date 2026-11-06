import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = rawUrl || 'https://pwquntnvqwdcrmtjgedb.supabase.co';
// Si el entorno de compilación aún tiene la clave JWT heredada deshabilitada (eyJ...), usar la nueva Publishable Key
const supabaseAnonKey = (!rawKey || String(rawKey).trim().startsWith('eyJ'))
    ? 'sb_publishable_LoE_NpThFDv6EDCvkad9RA_lvV7zNbU'
    : String(rawKey).trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
