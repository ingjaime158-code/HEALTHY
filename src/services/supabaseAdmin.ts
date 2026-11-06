/**
 * supabaseAdmin.ts
 * Database helpers using the authenticated user's Supabase session (RLS-enforced).
 *
 * SECURITY FIX: Removed VITE_SUPABASE_SERVICE_ROLE from client-side code so
 * administrative credentials are never bundled into browser JavaScript.
 */

import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

/**
 * Fetches all rows from a table using the authenticated session with pagination.
 * Throws an explicit error if any page fails so callers never confuse a partial
 * or failed read with a complete dataset.
 */
export async function adminSelect(table: string, select = '*'): Promise<any[]> {
    const allData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from(table)
            .select(select)
            .range(from, to);

        if (error) {
            console.error(`[adminSelect] ${table} error on page ${page}:`, error.message);
            throw new Error(`Error al consultar ${table} (página ${page}): ${error.message}`);
        }

        const rows = data || [];
        allData.push(...rows);

        if (rows.length < pageSize) {
            hasMore = false;
        } else {
            page++;
        }
    }
    return allData;
}

/**
 * Inserts a row (or rows) into a table using the authenticated session.
 */
export async function adminInsert(table: string, payload: any): Promise<any> {
    const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select();

    if (error) {
        console.error(`[adminInsert] ${table} error:`, error.message);
        throw new Error(error.message);
    }
    return data;
}

/**
 * Updates a row in a table by id using the authenticated session.
 */
export async function adminUpdate(table: string, id: string, payload: any): Promise<boolean> {
    const { error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', id);

    if (error) {
        console.error(`[adminUpdate] ${table} error:`, error.message);
        return false;
    }
    return true;
}

/**
 * Creates a user in Supabase Auth without exposing the service_role key in the client.
 * 1. Attempts the secure 'create-user' Edge Function (auto-confirms email on server).
 * 2. Falls back to an isolated non-persisting anon client signUp so the current
 *    administrator session is never overwritten.
 */
export async function adminCreateAuthUser(email: string, password: string): Promise<{ id: string } | null> {
    try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke('create-user', {
            body: { email, password },
        });

        if (!fnError && fnData?.id) {
            return { id: fnData.id };
        }
    } catch {
        // Edge Function not deployed or unreachable; proceed to isolated signUp fallback
    }

    try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const isolatedClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        });

        const { data, error } = await isolatedClient.auth.signUp({
            email,
            password,
        });

        if (error || !data.user) {
            console.warn(`[adminCreateAuthUser] signUp error or user already exists:`, error?.message);
            return null;
        }

        return { id: data.user.id };
    } catch (err) {
        console.warn(`[adminCreateAuthUser] unexpected error:`, err);
        return null;
    }
}

/**
 * Upserts a batch of rows in chunks using the authenticated session.
 */
export async function adminUpsertBatch(table: string, items: any[]): Promise<boolean> {
    if (!items || items.length === 0) return true;

    const CHUNK_SIZE = 100;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
            .from(table)
            .upsert(chunk, { onConflict: 'id' });

        if (error) {
            console.error(`[adminUpsertBatch] ${table} error on chunk starting at ${i}:`, error.message);
            return false;
        }
    }
    return true;
}


