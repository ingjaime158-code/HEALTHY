import { supabase } from '../supabaseClient';
import { Trip, PricingSettings } from './types';
import { sendPushNotificationToDriver } from '../pushService';

// --- Push Notification Helper ---
const notifyDriverAssignment = async (driverId: string, scheduledAt: string | null | undefined, recipientName: string | null | undefined) => {
    try {
        const { data } = await supabase.from('drivers').select('expo_push_token').eq('id', driverId).single();
        if (data && data.expo_push_token) {
            const title = scheduledAt ? '📦 Nueva Entrega Programada' : '📦 Nueva Entrega Asignada';
            const body = scheduledAt 
                ? `Programada para: ${new Date(scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` 
                : `Tienes una nueva entrega para ${recipientName || 'Cliente'}. ¡Abre la app!`;
                
            await sendPushNotificationToDriver(data.expo_push_token, title, body, { type: 'new_trip' });
        }
    } catch (err) {
        console.error('Failed to notify driver:', err);
    }
};

// --- Pricing ---
export const getPricingSettings = async (): Promise<PricingSettings> => {
    const { data, error } = await supabase.from('settings').select('*').limit(1).single();
    if (error || !data) {
        return { baseRate: 35.00, kmRate: 9.00, commissionRate: 15.0 };
    }
    return {
        baseRate: Number(data.base_fare),
        kmRate: Number(data.cost_per_km),
        commissionRate: Number(data.commission_percentage)
    };
};

export const savePricingSettings = async (settings: PricingSettings): Promise<void> => {
    // Check if exists
    const { count } = await supabase.from('settings').select('*', { count: 'exact', head: true });

    if (count && count > 0) {
        // Update first row
        // A bit hacky without ID, but we only have 1 row
        await supabase.from('settings').update({
            base_fare: settings.baseRate,
            cost_per_km: settings.kmRate,
            commission_percentage: settings.commissionRate,
            updated_at: new Date().toISOString()
        }).neq('id', '00000000-0000-0000-0000-000000000000');
    } else {
        await supabase.from('settings').insert({
            base_fare: settings.baseRate,
            cost_per_km: settings.kmRate,
            commission_percentage: settings.commissionRate
        });
    }
};

// --- Trips ---

// Shared mapper: DB row → Trip model (single source of truth)
const mapDbRowToTrip = (t: any): Trip => ({
    id: t.id,
    date: new Date(t.created_at).toLocaleDateString(),
    rawDate: t.created_at,
    time: new Date(t.created_at).toLocaleTimeString(),
    client: t.businesses?.name || 'Unknown',
    driver: t.drivers?.name || (t.driver_id ? 'Sin Asignar' : 'Unknown'),
    driverId: t.driver_id || t.drivers?.id,
    cost: Number(t.cost),
    status: t.status as any || 'Completado',
    origin: t.origin || 'Unknown',
    destination: t.destination || 'Unknown',
    baseFare: Number(t.cost) > 0 ? 35 : 0,
    distanceFare: Number(t.cost) > 35 ? Number(t.cost) - 35 : 0,
    image: '',
    passengerName: t.passenger_name || 'Desconocido',
    passengerPhone: t.passenger_phone || '',
    originLat: Number(t.origin_lat),
    originLng: Number(t.origin_lng),
    destLat: Number(t.dest_lat),
    destLng: Number(t.dest_lng),
    businessId: t.business_id,
    unitName: t.units?.name || 'Base Desconocida',
    isOwnUnit: t.units?.is_own || false,
    commissionAmount: Number(t.commission_amount || 0),
    paymentStatus: t.payment_status || 'Pendiente',
    clientConfirmed: t.client_confirmed || false,
    confirmedBy: t.confirmed_by_name,
    neighborhood: t.neighborhood,
    zipCode: t.zip_code,
    city: t.city,
    createdBy: t.created_by,
    distanceKm: Number(t.distance_km || 0),
    paymentMethod: t.payment_method || (t.business_id ? 'Crédito' : 'Efectivo'),
    driverSettled: t.driver_settled || false,
    receiptId: t.receipt_id || undefined,
    scheduledAt: t.scheduled_at,
    driverArrivedAt: t.driver_arrived_at,
    passengerBoardedAt: t.passenger_boarded_at,
    tripStartedAt: t.trip_started_at,
    waitTimeMinutes: Number(t.wait_time_minutes || 0),
    waitTimeCost: Number(t.wait_time_cost || 0),
    remisionDelivered: t.remision_delivered || false,
    remisionFolio: t.remision_folio || undefined,
    tollCost: Number(t.toll_cost || 0),
    createdAt: t.created_at,
    distance: Number(t.distance_km || 0),
    stops: Array.isArray(t.stops) ? t.stops : (typeof t.stops === 'string' ? JSON.parse(t.stops || '[]') : [])
});

export const getTrips = async (): Promise<Trip[]> => {
    const { data, error } = await supabase.from('trips').select(`
        *,
        businesses (name),
        units (name, is_own),
        drivers (id, name)
     `).order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching trips:', error);
        return [];
    }

    return data.map(mapDbRowToTrip);
};

export const getTripsByDateRange = async (startDate: Date, endDate: Date): Promise<Trip[]> => {
    const { data, error } = await supabase.from('trips')
        .select(`
            *,
            businesses (name),
            units (name, is_own),
            drivers (id, name)
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching trips by date range:', error);
        return [];
    }

    return data.map(mapDbRowToTrip);
};

export const getTripsPaginated = async (page: number = 1, pageSize: number = 50): Promise<{ data: Trip[], total: number }> => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase.from('trips').select(`
        *,
        businesses (name),
        units (name, is_own),
        drivers (id, name)
     `, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);

    if (error) {
        console.error('Error fetching paginated trips:', error);
        return { data: [], total: 0 };
    }

    return { data: data.map(mapDbRowToTrip), total: count || 0 };
};

export const getActiveTrips = async (): Promise<Trip[]> => {
    const { data, error } = await supabase.from('trips')
        .select(`*, businesses (name), units (name, is_own), drivers (id, name)`)
        .in('status', ['En Progreso', 'Programado'])
        .order('created_at', { ascending: false });

    if (error) return [];

    return data.map(mapDbRowToTrip);
};


export const addTrip = async (trip: {
    origin: string;
    destination: string;
    origin_lat: number;
    origin_lng: number;
    dest_lat: number;
    dest_lng: number;
    client?: string;
    unitId?: string; // Added field
    businessId?: string;
    driverId?: string; // Added field for manual assignment
    passengerName?: string;
    passengerPhone?: string;
    cost?: number;
    distance?: number;
    commissionAmount?: number;
    neighborhood?: string;
    zipCode?: string;
    city?: string;
    createdBy?: string;
    scheduledAt?: string; // Nuevo
    stops?: { address: string; lat: number; lng: number }[];
}): Promise<string | null> => {
    // Status logic: Programado para entregas agendadas, En Progreso para todo lo demás.
    // Se eliminó 'Pendiente de Confirmación' — el repartidor ve y actúa de inmediato.
    const tripStatus = trip.scheduledAt ? 'Programado' : 'En Progreso';

    const payload = {
        origin: trip.origin,
        destination: trip.destination,
        origin_lat: trip.origin_lat,
        origin_lng: trip.origin_lng,
        dest_lat: trip.dest_lat,
        dest_lng: trip.dest_lng,
        passenger_name: trip.passengerName,
        passenger_phone: trip.passengerPhone,
        business_id: trip.businessId || null,
        unit_id: trip.unitId || null,
        driver_id: trip.driverId || null,
        status: tripStatus,
        cost: trip.cost || 0,
        distance_km: trip.distance || 0,
        commission_amount: trip.commissionAmount || 0,
        payment_status: 'Pendiente',
        neighborhood: trip.neighborhood,
        zip_code: trip.zipCode,
        city: trip.city,
        created_by: trip.createdBy,
        payment_method: trip.businessId ? 'Crédito' : 'Efectivo',
        scheduled_at: trip.scheduledAt || null,
        toll_cost: 0,
        stops: trip.stops && trip.stops.length > 0 ? JSON.stringify(trip.stops) : '[]'
    };

    console.log('Sending addTrip payload:', payload);

    // 1. Insert Trip
    const { data, error } = await supabase.from('trips').insert(payload).select('id').single();


    if (error) {
        console.error('Error creating trip:', error);
        throw error;
    }

    if (payload.driver_id) {
        notifyDriverAssignment(payload.driver_id, payload.scheduled_at, payload.passenger_name);
    }

    return data.id;
};


export const updateTripStatus = async (tripId: string, status: string): Promise<boolean> => {
    const { error } = await supabase.from('trips').update({ status }).eq('id', tripId);
    if (error) {
        console.error('Error updating trip status:', error);
        return false;
    }
    return true;
};

// --- Public Client Confirmation ---
export const getPublicTripDetails = async (tripId: string) => {
    const { data, error } = await supabase.rpc('get_public_trip_details', { p_trip_id: tripId });
    if (error || !data || data.length === 0) {
        console.error('Error fetching public trip details:', error);
        return null;
    }
    return data[0]; // RPC returns a table, so we get the first row
};

export const confirmTripCost = async (tripId: string, confirmedByName: string): Promise<{ success: boolean; error?: string }> => {
    console.log('[confirmTripCost] Calling RPC with:', { tripId, confirmedByName });
    const { data, error } = await supabase.rpc('confirm_trip_cost', {
        p_trip_id: tripId,
        p_confirmed_by_name: confirmedByName
    });

    console.log('[confirmTripCost] RPC response:', { data, error });

    if (error) {
        console.error('[confirmTripCost] Supabase RPC error:', JSON.stringify(error));
        return { success: false, error: `RPC Error: ${error.message || error.code || JSON.stringify(error)}` };
    }

    if (data !== true) {
        console.warn('[confirmTripCost] RPC returned non-true value:', data);
        return { success: false, error: `La función retornó: ${JSON.stringify(data)}. La entrega puede ya estar confirmada.` };
    }

    return { success: true };
};

export const updateTripPaymentStatus = async (tripId: string, status: 'Pendiente' | 'Pagado'): Promise<boolean> => {
    const { error } = await supabase.from('trips').update({ payment_status: status }).eq('id', tripId);
    if (error) {
        console.error('Error updating trip payment status:', error);
        return false;
    }
    return true;
};

export const updateTrip = async (trip: Partial<Trip> & { id: string }): Promise<boolean> => {
    const updatePayload: any = {};
    if (trip.origin !== undefined) updatePayload.origin = trip.origin;
    if (trip.destination !== undefined) updatePayload.destination = trip.destination;
    if (trip.cost !== undefined) updatePayload.cost = trip.cost;
    if (trip.status !== undefined) updatePayload.status = trip.status;
    if (trip.driverId !== undefined) updatePayload.driver_id = trip.driverId || null;
    if (trip.passengerName !== undefined) updatePayload.passenger_name = trip.passengerName;
    if (trip.passengerPhone !== undefined) updatePayload.passenger_phone = trip.passengerPhone;
    if (trip.clientConfirmed !== undefined) updatePayload.client_confirmed = trip.clientConfirmed;
    if (trip.confirmedBy !== undefined) updatePayload.confirmed_by_name = trip.confirmedBy;

    // Coordinates
    if (trip.originLat !== undefined) updatePayload.origin_lat = trip.originLat;
    if (trip.originLng !== undefined) updatePayload.origin_lng = trip.originLng;
    if (trip.destLat !== undefined) updatePayload.dest_lat = trip.destLat;
    if (trip.destLng !== undefined) updatePayload.dest_lng = trip.destLng;

    // Additional Wait Time and Schedule Mapping
    if (trip.driverArrivedAt !== undefined) updatePayload.driver_arrived_at = trip.driverArrivedAt;
    if (trip.passengerBoardedAt !== undefined) updatePayload.passenger_boarded_at = trip.passengerBoardedAt;
    if (trip.tripStartedAt !== undefined) updatePayload.trip_started_at = trip.tripStartedAt;
    if (trip.waitTimeMinutes !== undefined) updatePayload.wait_time_minutes = trip.waitTimeMinutes;
    if (trip.waitTimeCost !== undefined) updatePayload.wait_time_cost = trip.waitTimeCost;
    if (trip.remisionDelivered !== undefined) updatePayload.remision_delivered = trip.remisionDelivered;
    if (trip.remisionFolio !== undefined) updatePayload.remision_folio = trip.remisionFolio;
    if (trip.scheduledAt !== undefined) updatePayload.scheduled_at = trip.scheduledAt;
    if (trip.tollCost !== undefined) updatePayload.toll_cost = trip.tollCost;
    if (trip.stops !== undefined) updatePayload.stops = JSON.stringify(trip.stops);

    const { error } = await supabase.from('trips').update(updatePayload).eq('id', trip.id);
    if (error) {
        console.error('Error updating trip:', error);
        return false;
    }

    // Trigger push if driver is explicitly set in this update
    if (updatePayload.driver_id) {
        notifyDriverAssignment(updatePayload.driver_id, updatePayload.scheduled_at || trip.scheduledAt, updatePayload.passenger_name || trip.passengerName);
    }

    return true;
};

export const deleteTrip = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const { error, data } = await supabase
        .from('trips')
        .delete()
        .eq('id', id)
        .select();

    if (error) {
        if (error.code === '23503') {
            return { success: false, error: 'No se puede eliminar: la entrega ya está vinculada a un recibo o liquidación.' };
        }
        console.error('Error deleting trip:', error);
        return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
        return { success: false, error: 'No se encontró la entrega o no tienes permisos para eliminarla.' };
    }

    return { success: true };
};
export const deleteTripsBulk = async (ids: string[]): Promise<{ success: boolean; error?: string }> => {
    if (!ids || ids.length === 0) return { success: true };

    const { error, data } = await supabase
        .from('trips')
        .delete()
        .in('id', ids)
        .select();

    if (error) {
        if (error.code === '23503') {
            return { success: false, error: 'Ocurrió un error: algunas entregas ya están facturadas o liquidadas y no pueden eliminarse.' };
        }
        console.error('Error deleting trips in bulk:', error);
        return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
        return { success: false, error: 'No se eliminaron registros. Verifica que las entregas existan y tengas permisos.' };
    }

    return { success: true };
};
