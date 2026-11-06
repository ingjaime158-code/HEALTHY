import { supabase } from '../supabaseClient';
import { adminSelect, adminInsert, adminUpdate } from '../supabaseAdmin';
import { RouteMap } from './types';

// --- Route Maps (formerly Destinations) ---
export const getRouteMaps = async (): Promise<RouteMap[]> => {
    const data = await adminSelect('destinations');
    return data.map((d: any) => ({
        id: d.id,
        name: d.name,
        morningMapUrl: d.morning_map_url || '',
        eveningMapUrl: d.evening_map_url || ''
    }));
};

export const addRouteMap = async (routeMap: Omit<RouteMap, 'id'>): Promise<RouteMap> => {
    const result = await adminInsert('destinations', {
        name: routeMap.name,
        morning_map_url: routeMap.morningMapUrl,
        evening_map_url: routeMap.eveningMapUrl
    });
    const data = Array.isArray(result) ? result[0] : result;
    return {
        id: data.id,
        name: data.name,
        morningMapUrl: data.morning_map_url,
        eveningMapUrl: data.evening_map_url
    };
};

export const updateRouteMap = async (routeMap: RouteMap): Promise<boolean> => {
    return adminUpdate('destinations', routeMap.id, {
        name: routeMap.name,
        morning_map_url: routeMap.morningMapUrl,
        evening_map_url: routeMap.eveningMapUrl
    });
};

export const deleteRouteMap = async (id: string): Promise<{ success: boolean, message?: string }> => {
    try {
        const { error: rpcErr } = await supabase.rpc('delete_destination_cascade', { p_dest_id: id });
        if (rpcErr) {
            const { error: directErr } = await supabase.from('destinations').delete().eq('id', id);
            if (directErr) {
                throw new Error(directErr.message || directErr.details || 'Error al borrar mapa');
            }
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, message: err?.message || 'Error al borrar mapa' };
    }
};
