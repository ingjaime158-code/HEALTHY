import { supabase } from '../supabaseClient';
import { adminSelect } from '../supabaseAdmin';
import { Business } from './types';

// --- Businesses ---
export const getBusinesses = async (): Promise<Business[]> => {
    const data = await adminSelect('businesses');
    if (!data || data.length === 0) return [];
    return data.map((b: any) => ({
        id: b.id,
        name: b.name,
        type: b.type || 'Other',
        location: b.location || '',
        lat: Number(b.lat) || 0,
        lng: Number(b.lng) || 0,
        phone: b.phone,
        email: b.email,
        rfc: b.rfc,
        parentId: b.parent_id,
        parentName: b.parent?.name,
        baseRate0to6: Number(b.base_rate_0_6km) || undefined,
        baseRate6to15: Number(b.base_rate_6_15km) || undefined,
        extraKmRate: Number(b.extra_km_rate) || undefined,
        waitRatePerMin: Number(b.wait_rate_per_min) || undefined,
        locationLink: b.location_link,
        routeType: b.route_type
    }));

};

export const addBusiness = async (business: Omit<Business, 'id'>): Promise<Business> => {
    const payload = {
        name: business.name,
        type: business.type,
        location: business.location || null,
        lat: business.lat || 0,
        lng: business.lng || 0,
        phone: business.phone || null,
        email: business.email || null,
        rfc: business.rfc || null,
        parent_id: business.parentId || null,
        base_rate_0_6km: business.baseRate0to6 || null,
        base_rate_6_15km: business.baseRate6to15 || null,
        extra_km_rate: business.extraKmRate || null,
        wait_rate_per_min: business.waitRatePerMin || null,
        location_link: business.locationLink || null,
        route_type: business.routeType || null
    };


    const { data, error } = await supabase.from('businesses').insert(payload).select().single();

    if (error) {
        console.error('Error in addBusiness:', error);
        throw error;
    }

    return {
        id: data.id,
        name: data.name,
        type: data.type,
        location: data.location || '',
        lat: Number(data.lat) || 0,
        lng: Number(data.lng) || 0,
        phone: data.phone || '',
        rfc: data.rfc || '',
        parentId: data.parent_id,
        baseRate0to6: Number(data.base_rate_0_6km) || undefined,
        baseRate6to15: Number(data.base_rate_6_15km) || undefined,
        extraKmRate: Number(data.extra_km_rate) || undefined,
        waitRatePerMin: Number(data.wait_rate_per_min) || undefined,
        locationLink: data.location_link,
        routeType: data.route_type
    };

};

export const updateBusiness = async (business: Business): Promise<boolean> => {
    const { error } = await supabase.from('businesses').update({
        name: business.name,
        type: business.type,
        location: business.location,
        lat: business.lat,
        lng: business.lng,
        phone: business.phone,
        rfc: business.rfc,
        parent_id: business.parentId || null,
        base_rate_0_6km: business.baseRate0to6 || null,
        base_rate_6_15km: business.baseRate6to15 || null,
        extra_km_rate: business.extraKmRate || null,
        wait_rate_per_min: business.waitRatePerMin || null,
        location_link: business.locationLink || null,
        route_type: business.routeType || null
    }).eq('id', business.id);


    if (error) {
        console.error('Error updating business:', error);
        return false;
    }
    return true;
};

export const deleteBusiness = async (id: string): Promise<{ success: boolean, message?: string }> => {
    try {
        // Use server-side cascade function (SECURITY DEFINER bypasses RLS)
        const { data, error } = await supabase.rpc('delete_business_cascade', { p_business_id: id });

        // The RPC can return HTTP 200 but with data=false if it internally caught an exception.
        // We must check BOTH the error object AND the returned boolean value.
        if (error) {
            console.error('RPC error:', error);
            return { success: false, message: `Error en RPC: ${error.message || error.details || 'desconocido'}` };
        }

        if (data === false) {
            // The RPC ran but hit an internal exception (WHEN OTHERS THEN RETURN FALSE).
            // This usually means a table name was wrong in the SQL, or a FK constraint was missed.
            // Try a direct delete as fallback.
            console.warn('delete_business_cascade returned false. Trying direct delete...');
            const { error: directErr } = await supabase.from('businesses').delete().eq('id', id);
            if (directErr) {
                console.error('Direct delete also failed:', directErr);
                return {
                    success: false,
                    message: `No se pudo eliminar. Error: ${directErr.message || directErr.details || 'desconocido'}. Puede ser una restricción de llave foránea.`
                };
            }
        }

        return { success: true };
    } catch (err: any) {
        console.error('Exception in deleteBusiness:', err);
        return { success: false, message: err?.message || 'Excepción desconocida al eliminar el negocio' };
    }
};
