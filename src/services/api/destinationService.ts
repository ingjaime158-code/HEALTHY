import { adminSelect, adminInsert, adminUpdate } from '../supabaseAdmin';
import { RouteMap } from './types';

// --- Route Maps (formerly Destinations) ---
export const getRouteMaps = async (): Promise<RouteMap[]> => {
    const data = await adminSelect('destinations');
    return data.map((d: any) => ({
        id: d.id,
        name: d.name,
        morningMapUrl: d.morning_my_maps_url || d.morning_map_url || '',
        eveningMapUrl: d.evening_my_maps_url || d.evening_map_url || ''
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
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const srvKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE;
        const res = await fetch(`${supabaseUrl}/rest/v1/destinations?id=eq.${id}`, {
            method: 'DELETE',
            headers: {
                'apikey': srvKey,
                'Authorization': `Bearer ${srvKey}`,
            }
        });
        if (!res.ok) throw new Error(await res.text());
        return { success: true };
    } catch (err: any) {
        return { success: false, message: err?.message || 'Error al borrar mapa' };
    }
};
