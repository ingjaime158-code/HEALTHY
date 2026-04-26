/**
 * supabaseAdmin.ts
 * Admin helpers using service_role key via raw fetch.
 * The supabase-js client in the browser preserves the user's auth session,
 * which means the service_role key gets overridden. Using raw fetch ensures
 * the service_role key is always used in the Authorization header.
 */

const getHeaders = () => {
    const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE || import.meta.env.VITE_SUPABASE_SERVICE_ROL;
    
    if (!supabaseServiceKey) {
        throw new Error("ALERTA CRÍTICA: No se encontró la llave VITE_SUPABASE_SERVICE_ROLE en las variables de entorno. Supabase está bloqueando la descarga de datos.");
    }

    return {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    };
};

/**
 * Fetches all rows from a table using the service_role key (bypasses RLS).
 */
export async function adminSelect(table: string, select = '*'): Promise<any[]> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
    const res = await fetch(url, { 
        headers: getHeaders(),
        cache: 'no-store'
    });
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
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const url = `${supabaseUrl}/rest/v1/${table}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
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
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        console.error(`[adminUpdate] ${table} error:`, res.status, await res.text());
        return false;
    }
    return true;
}

/**
 * Creates a user in Supabase Auth using the service_role key.
 * This bypasses email confirmation requirements.
 */
export async function adminCreateAuthUser(email: string, password: string): Promise<{ id: string } | null> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const url = `${supabaseUrl}/auth/v1/admin/users`;
    const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            email,
            password,
            email_confirm: true, // AUTO-CONFIRM email
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        console.warn(`[adminCreateAuthUser] error or already exists:`, res.status, err);
        return null;
    }

    const data = await res.json();
    return { id: data.id };
}
