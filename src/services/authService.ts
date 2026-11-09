import { supabase } from './supabaseClient';
import { adminCreateAuthUser } from './supabaseAdmin';

export interface User {
    email: string;
    password?: string;
    id?: string;
    name?: string;
    role: 'Administrador' | 'Usuario' | 'Chofer';
    businessId?: string;
    driverId?: string;
    allowedViews?: string[];
    created_at?: string;
}

export const initializeAuth = async () => {
    // Check session
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.email) {
        const email = data.session.user.email;
        const allowed = await checkAllowedUser(email);

        if (allowed) {
            localStorage.setItem('hd_current_user', email);
        } else {
            await supabase.auth.signOut();
            clearLocalAuth();
        }
    } else {
        clearLocalAuth();
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (!session?.user?.email) {
                clearLocalAuth();
            }
        } else if (event === 'SIGNED_OUT') {
            clearLocalAuth();
        }
    });
};

const clearLocalAuth = () => {
    _roleCache = null;
    localStorage.removeItem('hd_current_user');
    localStorage.removeItem('hd_user_role');
    localStorage.removeItem('hd_user_business_id');
    localStorage.removeItem('hd_user_name');
    localStorage.removeItem('hd_user_allowed_views');
};

// Public function to be called by Login.tsx or App.tsx
export const validateCurrentSession = async (): Promise<{ allowed: boolean, email?: string }> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user?.email) {
        console.warn('No active session or email found during validation.');
        clearLocalAuth();
        return { allowed: false };
    }

    const email = data.session.user.email;
    console.log(`Validating session for email: ${email}`);
    const isAllowed = await checkAllowedUser(email);

    if (isAllowed) {
        localStorage.setItem('hd_current_user', email);
        return { allowed: true, email };
    } else {
        console.error(`Access DENIED for email: ${email}. Not found in allowed_users table or missing role.`);
        // If not allowed, we sign out immediately
        await supabase.auth.signOut();
        clearLocalAuth();
        return { allowed: false, email };
    }
};

const checkAllowedUser = async (email: string): Promise<boolean> => {
    const { data } = await supabase.from('allowed_users').select('role, business_id, name').ilike('email', email).maybeSingle();
    if (data?.role) {
        localStorage.setItem('hd_user_role', data.role);
        if (data.business_id) localStorage.setItem('hd_user_business_id', data.business_id);
        else localStorage.removeItem('hd_user_business_id');
        if (data.name) localStorage.setItem('hd_user_name', data.name);
        else localStorage.removeItem('hd_user_name');
        // Fetch allowed_views separately (column may not exist yet)
        try {
            const { data: viewsData } = await supabase.from('allowed_users').select('allowed_views').ilike('email', email).maybeSingle();
            if (viewsData?.allowed_views) localStorage.setItem('hd_user_allowed_views', JSON.stringify(viewsData.allowed_views));
            else localStorage.removeItem('hd_user_allowed_views');
        } catch { localStorage.removeItem('hd_user_allowed_views'); }
        return true;
    }
    return false;
};

export const getAllowedUsers = async (): Promise<User[]> => {
    const { data, error } = await supabase.from('allowed_users').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error('Error fetching allowed users:', error);
        return [];
    }
    return data.map((u: any) => ({
        ...u,
        role: u.role,
        businessId: u.business_id,
        driverId: u.driver_id,
        allowedViews: u.allowed_views || []
    })) as User[];
};

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const addAllowedUser = async (email: string, password: string | undefined, role: 'Administrador' | 'Usuario' | 'Chofer', businessId?: string, name?: string, driverId?: string): Promise<boolean> => {
    // Validate email format
    if (!email || !isValidEmail(email)) {
        console.error('Invalid email format:', email);
        return false;
    }

    // Use Admin API / Edge Function to create user
    if (password) {
        const authData = await adminCreateAuthUser(email, password);
        if (!authData) {
            console.warn("Auth creation via Admin API skipped or failed (User might already exist in Auth).");
        }
    }

    const { data: existing } = await supabase.from('allowed_users').select('email').ilike('email', email).maybeSingle();
    if (existing) return false;

    // NOTE: Password is NOT stored here. Supabase Auth handles password hashing securely.
    const { error: dbError } = await supabase.from('allowed_users').insert({
        email,
        role,
        name: name || null,
        business_id: businessId || null,
        driver_id: driverId || null
    });

    if (dbError) {
        console.error("DB insertion failed:", dbError);
        return false;
    }

    return true;
};

export const updateAllowedUserRole = async (email: string, newRole: 'Administrador' | 'Usuario' | 'Chofer'): Promise<boolean> => {
    const { error } = await supabase.from('allowed_users').update({ role: newRole }).ilike('email', email);
    if (error) {
        console.error("Error updating user role:", error);
        return false;
    }
    invalidateRoleCache();
    return true;
};

export const updateAllowedUserName = async (email: string, name: string): Promise<boolean> => {
    const { error } = await supabase.from('allowed_users').update({ name }).ilike('email', email);
    if (error) {
        console.error("Error updating user name:", error);
        return false;
    }
    invalidateRoleCache();
    return true;
};

export interface UpdateUserData {
    newEmail?: string;
    newPassword?: string;
    newName?: string;
    newRole?: 'Administrador' | 'Usuario' | 'Chofer';
    newDriverId?: string;
}

export const updateAllowedUserFull = async (
    oldEmail: string,
    data: UpdateUserData
): Promise<{ success: boolean; message?: string }> => {
    const cleanOldEmail = oldEmail.trim().toLowerCase();
    const cleanNewEmail = data.newEmail ? data.newEmail.trim().toLowerCase() : cleanOldEmail;

    // 1. Intentar mediante RPC con privilegios SECURITY DEFINER para actualizar auth.users y allowed_users
    try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('admin_update_user_credentials', {
            p_old_email: cleanOldEmail,
            p_new_email: cleanNewEmail,
            p_new_password: data.newPassword && data.newPassword.trim().length >= 6 ? data.newPassword.trim() : null,
            p_new_name: data.newName !== undefined ? data.newName.trim() : null,
            p_new_role: data.newRole || null,
            p_new_driver_id: data.newRole === 'Chofer' ? (data.newDriverId || null) : null,
        });

        if (!rpcError && rpcData?.success) {
            // Actualizar sesión local si el usuario modificado es el actual
            const currentLogged = getCurrentUser();
            if (currentLogged && currentLogged.toLowerCase() === cleanOldEmail) {
                if (cleanNewEmail) localStorage.setItem('hd_current_user', cleanNewEmail);
                if (data.newName) localStorage.setItem('hd_user_name', data.newName.trim());
                if (data.newRole) localStorage.setItem('hd_user_role', data.newRole);
            }
            invalidateRoleCache();
            return { success: true, message: rpcData.message || 'Usuario y credenciales actualizados correctamente.' };
        }

        if (rpcError) {
            console.warn('[updateAllowedUserFull] RPC error o no instalada:', rpcError.message);
            // Si el error fue de validación explícita (ej. email duplicado o falta de permisos)
            if (rpcError.message.includes('ya se encuentra registrado') || rpcError.message.includes('Permiso denegado')) {
                return { success: false, message: rpcError.message };
            }
        }
    } catch (err: any) {
        console.warn('[updateAllowedUserFull] Llamada RPC falló, usando fallback:', err);
    }

    // 2. Fallback directo sobre tabla allowed_users
    try {
        const updatePayload: any = {};
        if (data.newName !== undefined) updatePayload.name = data.newName.trim() || null;
        if (data.newRole) updatePayload.role = data.newRole;
        if (data.newRole === 'Chofer') {
            updatePayload.driver_id = data.newDriverId || null;
        } else if (data.newRole) {
            updatePayload.driver_id = null;
        }
        if (cleanNewEmail !== cleanOldEmail) {
            updatePayload.email = cleanNewEmail;
        }

        const { error: dbError } = await supabase
            .from('allowed_users')
            .update(updatePayload)
            .ilike('email', cleanOldEmail);

        if (dbError) {
            return { success: false, message: `Error al actualizar en base de datos: ${dbError.message}` };
        }

        const currentLogged = getCurrentUser();
        if (currentLogged && currentLogged.toLowerCase() === cleanOldEmail) {
            if (cleanNewEmail) localStorage.setItem('hd_current_user', cleanNewEmail);
            if (data.newName) localStorage.setItem('hd_user_name', data.newName.trim());
            if (data.newRole) localStorage.setItem('hd_user_role', data.newRole);
        }

        invalidateRoleCache();

        if (data.newPassword && data.newPassword.trim().length >= 6) {
            return {
                success: true,
                message: 'Datos actualizados en la lista. Aviso: Para sincronizar la contraseña en el login de Supabase Auth, ejecute el script SQL ADMIN_USER_MANAGEMENT_RPC.sql en Supabase.'
            };
        }

        return { success: true, message: 'Usuario actualizado correctamente.' };
    } catch (err: any) {
        return { success: false, message: err?.message || 'Error inesperado al actualizar usuario.' };
    }
};

export const removeAllowedUser = async (email: string): Promise<void> => {
    const { error } = await supabase.from('allowed_users').delete().ilike('email', email);
    if (error) console.error("Error removing user from db:", error);
    invalidateRoleCache();
    console.warn("User removed from list. Actual Auth deletion requires admin rights/Edge Function.");
};

export const loginWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin, // Redirects to root (Landing Page)
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
        }
    });
    if (error) console.error("Google login failed:", error);
    return { data, error };
};

export const loginWithMicrosoft = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
            scopes: 'email',
            redirectTo: window.location.origin // Redirects to root (Landing Page)
        }
    });
    if (error) console.error("Microsoft login failed:", error);
    return { data, error };
};

export const login = async (email: string, password: string): Promise<boolean> => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error || !data.session) {
        console.error("Login failed:", error);
        return false;
    }
    return true;
};

export const logout = async () => {
    await supabase.auth.signOut();
    clearLocalAuth();
};

export const getCurrentUser = (): string | null => {
    return localStorage.getItem('hd_current_user');
};

export const getCurrentUserRole = (): 'Administrador' | 'Usuario' | 'Chofer' | null => {
    return localStorage.getItem('hd_user_role') as 'Administrador' | 'Usuario' | 'Chofer' | null;
};

export const getCurrentUserName = (): string | null => {
    return localStorage.getItem('hd_user_name');
};

export const getCurrentUserBusinessId = (): string | null => {
    return localStorage.getItem('hd_user_business_id');
};

export const getCurrentUserAllowedViews = (): string[] => {
    const raw = localStorage.getItem('hd_user_allowed_views');
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
};

export const updateAllowedUserViews = async (email: string, views: string[]): Promise<boolean> => {
    const { error } = await supabase.from('allowed_users').update({ allowed_views: views }).ilike('email', email);
    if (error) {
        console.error('Error updating user views:', error);
        return false;
    }
    invalidateRoleCache();
    return true;
};

export const isAuthenticated = (): boolean => {
    return !!localStorage.getItem('hd_current_user');
};

// --- Server-Side Role Validation ---
// In-memory cache keyed by normalized user email (valid for 5 minutes)
let _roleCache: {
    email: string;
    role: 'Administrador' | 'Usuario' | 'Chofer';
    businessId: string | null;
    name: string | null;
    timestamp: number;
} | null = null;
const ROLE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getServerValidatedRole = async (): Promise<{ role: 'Administrador' | 'Usuario' | 'Chofer' | null; businessId: string | null; name: string | null }> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionEmail = sessionData.session?.user?.email?.trim();

    if (!sessionEmail) {
        clearLocalAuth();
        return { role: null, businessId: null, name: null };
    }

    const normalizedEmail = sessionEmail.toLowerCase();

    // Return cache if fresh and belongs to the same authenticated user
    if (
        _roleCache &&
        _roleCache.email === normalizedEmail &&
        (Date.now() - _roleCache.timestamp) < ROLE_CACHE_TTL
    ) {
        return { role: _roleCache.role, businessId: _roleCache.businessId, name: _roleCache.name };
    }

    try {
        const { data } = await supabase
            .from('allowed_users')
            .select('role, business_id, name')
            .ilike('email', sessionEmail)
            .maybeSingle();

        if (data?.role) {
            _roleCache = {
                email: normalizedEmail,
                role: data.role as 'Administrador' | 'Usuario' | 'Chofer',
                businessId: data.business_id,
                name: data.name,
                timestamp: Date.now()
            };
            // Sync localStorage for backward compatibility
            localStorage.setItem('hd_current_user', sessionEmail);
            localStorage.setItem('hd_user_role', data.role);
            if (data.business_id) localStorage.setItem('hd_user_business_id', data.business_id);
            else localStorage.removeItem('hd_user_business_id');
            if (data.name) localStorage.setItem('hd_user_name', data.name);
            else localStorage.removeItem('hd_user_name');

            // Fetch allowed_views separately (column may not exist yet)
            try {
                const { data: viewsData } = await supabase.from('allowed_users').select('allowed_views').ilike('email', sessionEmail).maybeSingle();
                if (viewsData?.allowed_views) localStorage.setItem('hd_user_allowed_views', JSON.stringify(viewsData.allowed_views));
                else localStorage.removeItem('hd_user_allowed_views');
            } catch { localStorage.removeItem('hd_user_allowed_views'); }

            return { role: data.role as any, businessId: data.business_id, name: data.name };
        } else {
            // Authenticated in Supabase Auth, but not authorized in allowed_users
            clearLocalAuth();
            return { role: null, businessId: null, name: null };
        }
    } catch (e) {
        console.error('Server role validation error:', e);
    }

    return { role: null, businessId: null, name: null };
};

export const invalidateRoleCache = () => { _roleCache = null; };
