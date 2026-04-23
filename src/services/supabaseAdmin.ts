/**
 * supabaseAdmin.ts
 * Admin helpers using service_role key via raw fetch.
 * The supabase-js client in the browser preserves the user's auth session,
 * which means the service_role key gets overridden. Using raw fetch ensures
 * the service_role key is always used in the Authorization header.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROL || import.meta.env.VITE_SUPABASE_SERVICE_ROLE;

const headers = {
    'apikey': supabaseServiceKey,
    'Authorization': `Bearer ${supabaseServiceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
};

/**
 * Fetches all rows from a table using the service_role key (bypasses RLS).
 */
export async function adminSelect(table: string, select = '*'): Promise<any[]> {
    const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
        console.error(`[adminSelect] ${table} error:`, res.status, await res.text());
        return [];
    }
    return res.json();
}

/**
 * Inserts a row into a table using the service_role key (bypasses RLS).
 */
export async function adminInsert(table: string, data: any): Promise<any> {
    const url = `${supabaseUrl}/rest/v1/${table}`;
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.text();
        console.error(`[adminInsert] ${table} error:`, res.status, err);
        throw new Error(err);
    }
    return res.json();
}

/**
 * Updates a row in a table using the service_role key (bypasses RLS).
 */
export async function adminUpdate(table: string, id: string, data: any): Promise<boolean> {
    const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        console.error(`[adminUpdate] ${table} error:`, res.status, await res.text());
        return false;
    }
    return true;
}
