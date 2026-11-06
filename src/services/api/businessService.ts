import { supabase } from '../supabaseClient';
import { adminSelect, adminInsert, adminUpdate, adminUpsertBatch } from '../supabaseAdmin';
import { Business } from './types';
import { parseClientProfile } from '../../utils/clientProfile';

// Tracks whether the normalized columns (plan_type, driver, is_active, etc.) exist in the live DB.
let _structuredColumnsAvailable = false;

function buildStructuredProfileColumns(business: Partial<Business>): Record<string, any> {
    const profile = parseClientProfile(business as any);
    const routeConfigs: Record<string, any> = {};
    if (profile.Matutina) routeConfigs.Matutina = profile.Matutina;
    if (profile.Vespertina) routeConfigs.Vespertina = profile.Vespertina;

    const rawEmail = business.email || '';
    const isRealEmail = rawEmail.includes('@') && !rawEmail.trim().startsWith('{');

    return {
        plan_type: business.planType ?? profile.planType ?? 'HEALTHY',
        plans_count: business.plansCount ?? profile.plansCount ?? 1,
        exclusions: business.exclusions ?? profile.exclusions ?? 'Ninguna',
        siglas: business.siglas ?? profile.siglas ?? 'C',
        driver: business.driver ?? profile.driver ?? 'SIN ASIGNAR',
        is_active: business.isActive ?? profile.isActive ?? true,
        extra_dishes: business.extraDishes ?? profile.extraDishes ?? 0,
        tiempos: business.tiempos ?? profile.tiempos ?? 1,
        route_order: business.routeOrder ?? profile.routeOrder ?? 9999,
        package: business.package ?? profile.package ?? 'Comida',
        plans: Array.isArray(business.plans) && business.plans.length > 0 ? business.plans : (profile.plans || []),
        route_configs: business.routeConfigs ?? routeConfigs,
        contact_email: business.contactEmail ?? (isRealEmail ? rawEmail : null)
    };
}

function mapRowToBusiness(b: any): Business {
    const hasStructured = 'plan_type' in b || 'is_active' in b || 'driver' in b;
    if (hasStructured) {
        _structuredColumnsAvailable = true;
    }

    const parsedProfile = parseClientProfile(b);
    // Synthesize a canonical JSON string in `email` when structured columns are present
    // so all existing UI components reading `b.email` stay 100% synchronized with the columns.
    const synthesizedEmail =
        hasStructured && (!b.email || b.email.trim().startsWith('{'))
            ? JSON.stringify(parsedProfile)
            : b.email;

    return {
        id: b.id,
        name: b.name,
        type: b.type || 'Other',
        location: b.location || '',
        lat: Number(b.lat) || 0,
        lng: Number(b.lng) || 0,
        phone: b.phone,
        email: synthesizedEmail,
        contactEmail: b.contact_email || (b.email && b.email.includes('@') && !b.email.trim().startsWith('{') ? b.email : undefined),
        rfc: b.rfc,
        parentId: b.parent_id,
        parentName: b.parent?.name,
        baseRate0to6: Number(b.base_rate_0_6km) || undefined,
        baseRate6to15: Number(b.base_rate_6_15km) || undefined,
        extraKmRate: Number(b.extra_km_rate) || undefined,
        waitRatePerMin: Number(b.wait_rate_per_min) || undefined,
        locationLink: b.location_link,
        routeType: b.route_type,
        planType: parsedProfile.planType,
        plansCount: parsedProfile.plansCount,
        exclusions: parsedProfile.exclusions,
        siglas: parsedProfile.siglas,
        driver: parsedProfile.driver,
        isActive: parsedProfile.isActive,
        extraDishes: parsedProfile.extraDishes,
        tiempos: parsedProfile.tiempos,
        routeOrder: parsedProfile.routeOrder,
        package: parsedProfile.package,
        plans: parsedProfile.plans,
        routeConfigs: b.route_configs || {
            ...(parsedProfile.Matutina ? { Matutina: parsedProfile.Matutina } : {}),
            ...(parsedProfile.Vespertina ? { Vespertina: parsedProfile.Vespertina } : {})
        }
    };
}

// --- Businesses ---
export const getBusinesses = async (): Promise<Business[]> => {
    const data = await adminSelect('businesses');
    if (!data || data.length === 0) return [];
    return data.map(mapRowToBusiness);
};

export const addBusiness = async (business: Omit<Business, 'id'>): Promise<Business> => {
    const basePayload: Record<string, any> = {
        name: business.name,
        type: business.type,
        location: business.location || null,
        lat: business.lat || 0,
        lng: business.lng || 0,
        phone: business.phone || null,
        email: business.email || JSON.stringify(parseClientProfile(business as any)),
        rfc: business.rfc || null,
        parent_id: business.parentId || null,
        base_rate_0_6km: business.baseRate0to6 || null,
        base_rate_6_15km: business.baseRate6to15 || null,
        extra_km_rate: business.extraKmRate || null,
        wait_rate_per_min: business.waitRatePerMin || null,
        location_link: business.locationLink || null,
        route_type: business.routeType || null
    };

    const fullPayload = _structuredColumnsAvailable
        ? { ...basePayload, ...buildStructuredProfileColumns(business) }
        : basePayload;

    let insertedData = await adminInsert('businesses', fullPayload);
    if ((!insertedData || insertedData.length === 0) && _structuredColumnsAvailable) {
        _structuredColumnsAvailable = false;
        insertedData = await adminInsert('businesses', basePayload);
    }

    if (!insertedData || insertedData.length === 0) {
        throw new Error('Error in addBusiness: Insert failed or returned empty data');
    }
    return mapRowToBusiness(insertedData[0]);
};

export const updateBusiness = async (business: Business): Promise<boolean> => {
    const basePayload: Record<string, any> = {
        name: business.name,
        type: business.type,
        location: business.location,
        lat: business.lat,
        lng: business.lng,
        phone: business.phone,
        email: business.email || JSON.stringify(parseClientProfile(business)),
        rfc: business.rfc,
        parent_id: business.parentId || null,
        base_rate_0_6km: business.baseRate0to6 || null,
        base_rate_6_15km: business.baseRate6to15 || null,
        extra_km_rate: business.extraKmRate || null,
        wait_rate_per_min: business.waitRatePerMin || null,
        location_link: business.locationLink || null,
        route_type: business.routeType || null
    };

    if (_structuredColumnsAvailable) {
        const ok = await adminUpdate('businesses', business.id, {
            ...basePayload,
            ...buildStructuredProfileColumns(business)
        });
        if (ok) return true;
        _structuredColumnsAvailable = false;
    }

    return await adminUpdate('businesses', business.id, basePayload);
};

export const updateBusinessesBatch = async (businesses: Business[]): Promise<boolean> => {
    if (!businesses || businesses.length === 0) return true;
    const buildItems = (includeStructured: boolean) =>
        businesses.map(b => {
            const base: Record<string, any> = {
                id: b.id,
                name: b.name,
                type: b.type,
                location: b.location,
                lat: b.lat,
                lng: b.lng,
                phone: b.phone,
                email: b.email || JSON.stringify(parseClientProfile(b)),
                rfc: b.rfc,
                parent_id: b.parentId || null,
                base_rate_0_6km: b.baseRate0to6 || null,
                base_rate_6_15km: b.baseRate6to15 || null,
                extra_km_rate: b.extraKmRate || null,
                wait_rate_per_min: b.waitRatePerMin || null,
                location_link: b.locationLink || null,
                route_type: b.routeType || null
            };
            return includeStructured ? { ...base, ...buildStructuredProfileColumns(b) } : base;
        });

    if (_structuredColumnsAvailable) {
        const ok = await adminUpsertBatch('businesses', buildItems(true));
        if (ok) return true;
        _structuredColumnsAvailable = false;
    }

    return await adminUpsertBatch('businesses', buildItems(false));
};

export const deleteBusiness = async (id: string): Promise<{ success: boolean, message?: string }> => {
    try {
        // Use server-side cascade function (SECURITY DEFINER bypasses RLS)
        const { data, error } = await supabase.rpc('delete_business_cascade', { p_business_id: id });

        if (error) {
            console.error('RPC error:', error);
            return { success: false, message: `Error en RPC: ${error.message || error.details || 'desconocido'}` };
        }

        if (data === false) {
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
