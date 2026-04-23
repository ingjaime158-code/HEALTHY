import { supabase } from '../supabaseClient';

// --- Business Origins (Quick Origin Points per Commercial Client) ---

export interface BusinessOrigin {
    id: string;
    businessId: string;
    businessName?: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    createdAt: string;
}

export const getBusinessOrigins = async (): Promise<BusinessOrigin[]> => {
    const { data, error } = await supabase
        .from('business_origins')
        .select('*, businesses(name)')
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching business origins:', error);
        return [];
    }

    return data.map((d: any) => ({
        id: d.id,
        businessId: d.business_id,
        businessName: d.businesses?.name || '',
        name: d.name,
        address: d.address || '',
        lat: Number(d.lat) || 0,
        lng: Number(d.lng) || 0,
        createdAt: d.created_at
    }));
};

export const getBusinessOriginsByBusiness = async (businessId: string): Promise<BusinessOrigin[]> => {
    const { data, error } = await supabase
        .from('business_origins')
        .select('*')
        .eq('business_id', businessId)
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching business origins for business:', error);
        return [];
    }

    return data.map((d: any) => ({
        id: d.id,
        businessId: d.business_id,
        name: d.name,
        address: d.address || '',
        lat: Number(d.lat) || 0,
        lng: Number(d.lng) || 0,
        createdAt: d.created_at
    }));
};

export const addBusinessOrigin = async (origin: Omit<BusinessOrigin, 'id' | 'createdAt' | 'businessName'>): Promise<BusinessOrigin | null> => {
    const { data, error } = await supabase
        .from('business_origins')
        .insert({
            business_id: origin.businessId,
            name: origin.name,
            address: origin.address || '',
            lat: origin.lat,
            lng: origin.lng
        })
        .select()
        .single();

    if (error) {
        console.error('Error adding business origin:', error);
        return null;
    }

    return {
        id: data.id,
        businessId: data.business_id,
        name: data.name,
        address: data.address || '',
        lat: Number(data.lat) || 0,
        lng: Number(data.lng) || 0,
        createdAt: data.created_at
    };
};

export const updateBusinessOrigin = async (origin: BusinessOrigin): Promise<boolean> => {
    const { error } = await supabase
        .from('business_origins')
        .update({
            name: origin.name,
            address: origin.address,
            lat: origin.lat,
            lng: origin.lng
        })
        .eq('id', origin.id);

    if (error) {
        console.error('Error updating business origin:', error);
        return false;
    }
    return true;
};

export const deleteBusinessOrigin = async (id: string): Promise<boolean> => {
    const { error } = await supabase
        .from('business_origins')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting business origin:', error);
        return false;
    }
    return true;
};
