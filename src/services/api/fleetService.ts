import { supabase } from '../supabaseClient';
import { adminSelect } from '../supabaseAdmin';
import { FleetUnit, Driver, Administrator } from './types';

// --- Fleet Units ---
export const getUnits = async (): Promise<FleetUnit[]> => {
    const data = await adminSelect('units');
    if (!data || data.length === 0) return [];

    return data.map((u: any) => ({
        id: u.id,
        name: u.name || 'Unnamed',
        identifier: u.identifier || '', // Map identifier
        managerName: u.manager_name || '',
        managerNumber: u.manager_number || '',
        receptionistNumber: u.receptionist_number,
        location: u.location || '',
        lat: Number(u.lat) || 0,
        lng: Number(u.lng) || 0,
        isOwn: u.is_own || false // Map is_own
    }));
};

export const addUnit = async (unit: Omit<FleetUnit, 'id'>): Promise<FleetUnit> => {
    const payload = {
        name: unit.name,
        identifier: unit.identifier || unit.name.substring(0, 10).toUpperCase(),
        manager_name: unit.managerName || null,
        manager_number: unit.managerNumber || null,
        receptionist_number: unit.receptionistNumber || null,
        location: unit.location || null,
        lat: unit.lat,
        lng: unit.lng,
        is_own: unit.isOwn || false
    };

    const { data, error } = await supabase.from('units').insert(payload).select().single();

    if (error) {
        console.error('Error in addUnit:', error);
        throw error;
    }

    return {
        id: data.id,
        name: data.name,
        identifier: data.identifier,
        managerName: data.manager_name,
        managerNumber: data.manager_number,
        receptionistNumber: data.receptionist_number,
        location: data.location || '',
        lat: Number(data.lat) || 0,
        lng: Number(data.lng) || 0,
        isOwn: data.is_own
    };
};

export const updateUnit = async (unit: FleetUnit): Promise<boolean> => {
    const { error } = await supabase.from('units').update({
        name: unit.name,
        manager_name: unit.managerName,
        manager_number: unit.managerNumber,
        receptionist_number: unit.receptionistNumber,
        location: unit.location,
        lat: unit.lat,
        lng: unit.lng,
        is_own: unit.isOwn
    }).eq('id', unit.id);

    if (error) {
        console.error('Error updating unit:', error);
        return false;
    }
    return true;
};

export const deleteUnit = async (id: string): Promise<{ success: boolean, message?: string }> => {
    try {
        const { error: rpcErr } = await supabase.rpc('delete_unit_cascade', { p_unit_id: id });
        if (rpcErr) {
            console.warn('RPC delete_unit_cascade error, trying direct delete...', rpcErr);
            const { error: directErr } = await supabase.from('units').delete().eq('id', id);
            if (directErr) {
                console.error('Direct error deleting unit:', directErr);
                return { success: false, message: directErr.message || directErr.details || 'Error desconocido' };
            }
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, message: err?.message || 'Excepción desconocida al borrar' };
    }
};

// --- Drivers ---
export const getDrivers = async (): Promise<Driver[]> => {
    const data = await adminSelect('drivers');
    if (!data || data.length === 0) return [];

    return data.map((d: any) => ({
        id: d.id,
        name: d.name,
        phoneNumber: d.phone || '',
        morningSheetUrl: d.morning_sheet_url || '',
        eveningSheetUrl: d.evening_sheet_url || '',
        morningMapUrl: d.morning_my_maps_url || '',
        eveningMapUrl: d.evening_my_maps_url || '',
        password: d.password || '',
        unitId: d.unit_id
    }));
};

export const addDriver = async (driver: Omit<Driver, 'id'>): Promise<Driver> => {
    const { data, error } = await supabase.from('drivers').insert({
        name: driver.name,
        phone: driver.phoneNumber,
        morning_sheet_url: driver.morningSheetUrl,
        evening_sheet_url: driver.eveningSheetUrl,
        morning_my_maps_url: driver.morningMyMapsUrl,
        evening_my_maps_url: driver.eveningMyMapsUrl,
        password: driver.password,
        unit_id: driver.unitId || null
    }).select().single();

    if (error) throw error;

    return {
        id: data.id,
        name: data.name,
        phoneNumber: data.phone,
        morningSheetUrl: data.morning_sheet_url,
        eveningSheetUrl: data.evening_sheet_url,
        morningMyMapsUrl: data.morning_my_maps_url,
        eveningMyMapsUrl: data.evening_my_maps_url,
        password: data.password,
        unitId: data.unit_id
    };
};

export const updateDriver = async (driver: Driver): Promise<boolean> => {
    const { error } = await supabase.from('drivers').update({
        name: driver.name,
        phone: driver.phoneNumber,
        morning_sheet_url: driver.morningSheetUrl,
        evening_sheet_url: driver.eveningSheetUrl,
        morning_my_maps_url: driver.morningMyMapsUrl,
        evening_my_maps_url: driver.eveningMyMapsUrl,
        password: driver.password,
        unit_id: driver.unitId || null
    }).eq('id', driver.id);

    if (error) {
        console.error('Error updating driver:', error);
        return false;
    }
    return true;
};

export const deleteDriver = async (id: string): Promise<{ success: boolean, message?: string }> => {
    try {
        const { error: rpcErr } = await supabase.rpc('delete_driver_cascade', { p_driver_id: id });
        if (rpcErr) {
            console.warn('RPC delete_driver_cascade error, trying direct delete...', rpcErr);
            const { error: directErr } = await supabase.from('drivers').delete().eq('id', id);
            if (directErr) {
                console.error('Error deleting driver:', directErr);
                return { success: false, message: directErr.message || directErr.details || 'Error desconocido' };
            }
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, message: err?.message || 'Excepción desconocida al borrar repartidor' };
    }
};


// --- Administrators ---
export const getAdministrators = async (): Promise<Administrator[]> => {
    const { data, error } = await supabase.from('administrators').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error('Error fetching administrators:', error);
        return [];
    }
    return data.map((a: any) => ({
        id: a.id,
        name: a.name,
        phone: a.phone,
        createdAt: a.created_at
    }));
};

export const addAdministrator = async (admin: { name: string; phone: string }): Promise<Administrator> => {
    const { data, error } = await supabase.from('administrators').insert({
        name: admin.name,
        phone: admin.phone
    }).select().single();

    if (error) throw error;

    return {
        id: data.id,
        name: data.name,
        phone: data.phone,
        createdAt: data.created_at
    };
};

export const updateAdministrator = async (admin: Administrator): Promise<boolean> => {
    const { error } = await supabase.from('administrators').update({
        name: admin.name,
        phone: admin.phone
    }).eq('id', admin.id);

    if (error) {
        console.error('Error updating administrator:', error);
        return false;
    }
    return true;
};

export const deleteAdministrator = async (id: string): Promise<{ success: boolean, message?: string }> => {
    try {
        const { error: rpcErr } = await supabase.rpc('delete_admin_cascade', { p_admin_id: id });
        if (rpcErr) {
            console.warn('RPC delete_admin_cascade error, trying direct delete...', rpcErr);
            const { error: directErr } = await supabase.from('administrators').delete().eq('id', id);
            if (directErr) {
                console.error('Error deleting administrator:', directErr);
                return { success: false, message: directErr.message || directErr.details || 'Error desconocido' };
            }
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, message: err?.message || 'Excepción desconocida al borrar admin' };
    }
};
