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
    if (data.session) {
        const email = data.session.user.email || '';
        // We silently check permissions to update local role if possible, 
        // but we DO NOT force sign out here. We let the UI Guards handle access denial.
        const allowed = await checkAllowedUser(email);

        if (allowed) {
            localStorage.setItem('hd_current_user', email);
        }
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            // We allow the UI to handle the redirect logic
        } else if (event === 'SIGNED_OUT') {
            clearLocalAuth();
        }
    });
};

const clearLocalAuth = () => {
    localStorage.removeItem('hd_current_user');
    localStorage.removeItem('hd_user_role');
    localStorage.removeItem('hd_user_business_id');
    localStorage.removeItem('hd_user_name');
    localStorage.removeItem('hd_user_allowed_views');
}

// New public function to be called by Login.tsx or App.tsx
export const validateCurrentSession = async (): Promise<{ allowed: boolean, email?: string }> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user?.email) {
        console.warn('No active session or email found during validation.');
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
        if (data.name) localStorage.setItem('hd_user_name', data.name);
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

    // Use Admin API to create user with auto-confirm enabled
    if (password) {
        const authData = await adminCreateAuthUser(email, password);
        // We don't block if adminCreateAuthUser fails (it might be because user already exists in Auth but not in allowed_users)
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
    return true;
};

export const updateAllowedUserName = async (email: string, name: string): Promise<boolean> => {
    const { error } = await supabase.from('allowed_users').update({ name }).ilike('email', email);
    if (error) {
        console.error("Error updating user name:", error);
        return false;
    }
    return true;
};

export const removeAllowedUser = async (email: string): Promise<void> => {
    const { error } = await supabase.from('allowed_users').delete().ilike('email', email);
    if (error) console.error("Error removing user from db:", error);
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
}

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
    return true;
};

export const isAuthenticated = (): boolean => {
    return !!localStorage.getItem('hd_current_user');
};

// --- Server-Side Role Validation ---
// In-memory cache to avoid repeated DB calls (valid for 5 minutes)
let _roleCache: { role: string | null; businessId: string | null; name: string | null; timestamp: number } | null = null;
const ROLE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getServerValidatedRole = async (): Promise<{ role: 'Administrador' | 'Usuario' | 'Chofer' | null; businessId: string | null; name: string | null }> => {
    // Return cache if fresh
    if (_roleCache && (Date.now() - _roleCache.timestamp) < ROLE_CACHE_TTL) {
        return { role: _roleCache.role as any, businessId: _roleCache.businessId, name: _roleCache.name };
    }

    const email = getCurrentUser();
    if (!email) return { role: null, businessId: null, name: null };

    try {
        const { data } = await supabase
            .from('allowed_users')
            .select('role, business_id, name')
            .ilike('email', email)
            .maybeSingle();

        if (data?.role) {
            _roleCache = { role: data.role, businessId: data.business_id, name: data.name, timestamp: Date.now() };
            // Also sync localStorage for backward compatibility
            localStorage.setItem('hd_user_role', data.role);
            if (data.business_id) localStorage.setItem('hd_user_business_id', data.business_id);
            if (data.name) localStorage.setItem('hd_user_name', data.name);
            // Fetch allowed_views separately (column may not exist yet)
            try {
                const { data: viewsData } = await supabase.from('allowed_users').select('allowed_views').ilike('email', email).maybeSingle();
                if (viewsData?.allowed_views) localStorage.setItem('hd_user_allowed_views', JSON.stringify(viewsData.allowed_views));
                else localStorage.removeItem('hd_user_allowed_views');
            } catch { localStorage.removeItem('hd_user_allowed_views'); }
            return { role: data.role as any, businessId: data.business_id, name: data.name };
        }
    } catch (e) {
        console.error('Server role validation error:', e);
    }

    return { role: null, businessId: null, name: null };
};

export const invalidateRoleCache = () => { _roleCache = null; };