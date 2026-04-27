import { supabase } from '../supabaseClient';
// Removed supabase

// Data Types
export interface Business {
    id: string;
    name: string;
    type: string;
    location: string;
    lat: number;
    lng: number;
    phone?: string;
    email?: string;
    rfc?: string;
    parentId?: string;
    parentName?: string;
    baseRate0to6?: number;
    baseRate6to15?: number;
    extraKmRate?: number;
    waitRatePerMin?: number;
    locationLink?: string;
    routeType?: 'Matutina' | 'Vespertina';
}


export interface FleetUnit {
    id: string;
    name: string;
    identifier: string; // Added field
    managerName: string;
    managerNumber: string;
    receptionistNumber?: string;
    location: string;
    lat: number;
    lng: number;
    isOwn?: boolean;
}

export interface Driver {
    id: string;
    name: string;
    phoneNumber: string;
    password?: string;
    morningSheetUrl?: string;
    eveningSheetUrl?: string;
    morningMyMapsUrl?: string;
    eveningMyMapsUrl?: string;
    unitId: string;
    expoPushToken?: string;
    colorHex?: string;
}

export interface Administrator {
    id: string;
    name: string;
    phone: string;
    createdAt: string;
}

export interface RouteMap {
    id: string;
    name: string;
    morningMapUrl?: string;
    eveningMapUrl?: string;
}

export interface Trip {
    id: string;
    date: string;
    time: string;
    client: string;
    driver: string;
    cost: number;
    status: 'Completado' | 'En Progreso' | 'Cancelado' | 'Pendiente de Confirmación' | 'Programado';
    origin: string;
    destination: string;
    baseFare: number;
    distanceFare: number;
    image: string;
    passengerName?: string;
    passengerPhone?: string;
    originLat?: number;
    originLng?: number;
    destLat?: number;
    destLng?: number;
    driverId?: string;
    rawDate: string;
    commissionAmount?: number;
    paymentStatus?: 'Pendiente' | 'Pagado';
    clientConfirmed?: boolean;
    confirmedBy?: string;
    neighborhood?: string;
    zipCode?: string;
    city?: string;
    unitName?: string;
    isOwnUnit?: boolean;
    createdBy?: string;
    distanceKm?: number;
    businessId?: string;
    paymentMethod?: 'Efectivo' | 'Crédito';
    driverSettled?: boolean;
    receiptId?: string;
    scheduledAt?: string;
    driverArrivedAt?: string;
    passengerBoardedAt?: string;
    tripStartedAt?: string;
    waitTimeMinutes?: number;
    waitTimeCost?: number;
    remisionDelivered?: boolean;
    remisionFolio?: string;
    tollCost?: number;
    createdAt?: string;
    distance?: number;
    stops?: { address: string; lat: number; lng: number }[];
}

export interface PricingSettings {
    baseRate: number;
    kmRate: number;
    commissionRate: number;
}


export interface KPILog {
    id: string;
    metric_key: string;
    value: number;
    notes?: string;
    created_at: string;
}

export const getKPILogs = async (): Promise<KPILog[]> => {
    const { data, error } = await supabase
        .from('kpi_logs')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching KPI logs:', error);
        return [];
    }
    return data.map((d: any) => ({
        id: d.id,
        metric_key: d.metric_key,
        value: Number(d.value),
        notes: d.notes,
        created_at: d.created_at
    }));
};

export const addKPILog = async (metricKey: string, value: number, notes?: string): Promise<KPILog | null> => {
    const { data, error } = await supabase.from('kpi_logs').insert({
        metric_key: metricKey,
        value: value,
        notes: notes
    }).select().single();

    if (error) {
        console.error('Error adding KPI log:', error);
        return null;
    }

    return {
        id: data.id,
        metric_key: data.metric_key,
        value: Number(data.value),
        notes: data.notes,
        created_at: data.created_at
    };
};

export const deleteKPILog = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('kpi_logs').delete().eq('id', id);
    if (error) {
        console.error('Error deleting KPI log:', error);
        return false;
    }
    return true;
};

export const getLatestDriverLocations = async (): Promise<{ [driverId: string]: { lat: number, lng: number, heading: number } }> => {
    // Only fetch locations updated within the last 12 hours to prevent ghost drivers
    // NOTE: We filter on updated_at (not created_at) because the mobile app does UPSERT
    // on driver_id, so created_at is only set once on first insert, while updated_at
    // is refreshed every ~3 seconds by the GPS tracking service.
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: rawData, error: rawError } = await supabase
        .from('driver_locations')
        .select('*')
        .gte('updated_at', twelveHoursAgo)
        .order('updated_at', { ascending: false })
        .limit(300);

    const locations: { [driverId: string]: { lat: number, lng: number, heading: number } } = {};
    
    if (rawError) {
        console.error('Error fetching driver locations:', rawError);
        return locations;
    }

    if (rawData) {
        for (const loc of rawData) {
            // Because it's ordered by updated_at DESC, the first time we see a driverId, it's the latest
            if (loc.driver_id && !locations[loc.driver_id]) {
                locations[loc.driver_id] = {
                    lat: Number(loc.lat),
                    lng: Number(loc.lng),
                    heading: Number(loc.heading) || 0
                };
            }
        }
    }
    return locations;
};

export const initializeData = () => {
    // No-op for real backend
};



export interface Lead {
    id: number;
    contactName: string;
    contactEmail: string;
    companyName: string;
    serviceType: string;
    messageDetails?: string;
    status: 'Pendiente' | 'Contactado' | 'Convertido' | 'Rechazado';
    createdAt: string;
}

export const getLeads = async (): Promise<Lead[]> => {
    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching leads:', error);
        return [];
    }

    return data.map((l: any) => ({
        id: l.id,
        contactName: l.contact_name,
        contactEmail: l.contact_email,
        companyName: l.company_name,
        serviceType: l.service_type,
        messageDetails: l.message_details,
        status: l.status || 'Pendiente',
        createdAt: l.created_at
    }));
};

export interface MarketplaceListing {
    id: string;
    title: string;
    description?: string;
    type: 'offer' | 'request'; // 'offer' = I sell/provide, 'request' = I need
    price?: number;
    businessId?: string; // Who posted it
    businessName?: string; // Joined name
    businessLocation?: string; // Joined location
    contactInfo?: string;
    status: 'Active' | 'Closed';
    createdAt: string;

    // New Fields
    category?: string;
    imageUrl?: string;
    minQuantity?: string;
    priceWholesale?: number;
    priceRetail?: number;
}

export const getMarketplaceListings = async (): Promise<MarketplaceListing[]> => {
    const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*, businesses(name, location)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching marketplace listings:', error);
        return [];
    }

    return data.map((d: any) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        type: d.type,
        price: d.price ? Number(d.price) : undefined,
        businessId: d.business_id,
        businessName: d.businesses?.name || 'Comercio Local',
        businessLocation: d.businesses?.location || 'Ubicación General',
        contactInfo: d.contact_info,
        status: d.status,
        createdAt: d.created_at,
        category: d.category || 'General',
        imageUrl: d.image_url,
        minQuantity: d.min_quantity,
        priceWholesale: d.price_wholesale ? Number(d.price_wholesale) : undefined,
        priceRetail: d.price_retail ? Number(d.price_retail) : undefined
    }));
};

export const addMarketplaceListing = async (listing: Omit<MarketplaceListing, 'id' | 'createdAt' | 'businessName' | 'businessLocation'>): Promise<MarketplaceListing | null> => {
    const { data, error } = await supabase.from('marketplace_listings').insert({
        title: listing.title,
        description: listing.description,
        type: listing.type,
        price: listing.price,
        business_id: listing.businessId,
        contact_info: listing.contactInfo,
        status: listing.status || 'Active',
        category: listing.category,
        image_url: listing.imageUrl,
        min_quantity: listing.minQuantity,
        price_wholesale: listing.priceWholesale,
        price_retail: listing.priceRetail
    }).select('*, businesses(name, location)').single();

    if (error) {
        console.error('Error adding listing:', error);
        return null;
    }

    return {
        id: data.id,
        title: data.title,
        description: data.description,
        type: data.type,
        price: data.price ? Number(data.price) : undefined,
        businessId: data.business_id,
        businessName: data.businesses?.name,
        businessLocation: data.businesses?.location,
        contactInfo: data.contact_info,
        status: data.status,
        createdAt: data.created_at,
        category: data.category,
        imageUrl: data.image_url,
        minQuantity: data.min_quantity,
        priceWholesale: data.price_wholesale ? Number(data.price_wholesale) : undefined,
        priceRetail: data.price_retail ? Number(data.price_retail) : undefined
    };
};

export const deleteMarketplaceListing = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('marketplace_listings').delete().eq('id', id);
    if (error) return false;
    return true;
};


// --- New Commercialization Module (Products & Transactions) ---

export interface Product {
    id: string;
    businessId: string;
    businessName?: string;
    name: string;
    description: string;
    priceRetail: number;
    priceWholesale: number;
    wholesaleMinQty: number;
    imageUrl: string;
    images?: string[]; // New field for multiple images
    category: string;
    type: 'product' | 'request';
    status?: 'active' | 'closed'; // New field
    createdAt: string;
}

export interface CommercialTransaction {
    id: string;
    providerBusinessId: string;
    providerName?: string;
    providerEmail?: string;
    providerRfc?: string;
    receiverBusinessId: string;
    receiverName?: string;
    receiverEmail?: string;
    receiverRfc?: string;
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    commission?: number;
    iva?: number;
    status: 'Pendiente' | 'Pagado' | 'Entregado' | 'Cancelado';
    transactionDate: string;
    notes?: string;
    createdAt: string;
}

// Products
export const getProducts = async (): Promise<Product[]> => {
    const { data, error } = await supabase
        .from('products')
        .select('*, businesses(name)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching products:', error);
        return [];
    }

    return data.map((p: any) => ({
        id: p.id,
        businessId: p.business_id,
        businessName: p.businesses?.name,
        name: p.name,
        description: p.description,
        priceRetail: Number(p.price_retail),
        priceWholesale: Number(p.price_wholesale),
        wholesaleMinQty: Number(p.wholesale_min_qty),
        imageUrl: p.image_url,
        images: p.images || (p.image_url ? [p.image_url] : []),
        category: p.category,
        type: p.type || 'product',
        status: p.status || 'active',
        createdAt: p.created_at
    }));
};

export const addProduct = async (product: Omit<Product, 'id' | 'createdAt' | 'businessName'>): Promise<Product | null> => {
    // Clean payload to avoid sending undefined/NaN
    const payload = {
        business_id: product.businessId,
        name: product.name,
        description: product.description,
        price_retail: product.priceRetail || 0,
        price_wholesale: product.priceWholesale || 0,
        wholesale_min_qty: product.wholesaleMinQty || 0,
        image_url: product.imageUrl,
        images: product.images || (product.imageUrl ? [product.imageUrl] : []),
        category: product.category,
        type: product.type || 'product',
        status: 'active'
    };

    // removed businesses(name) from select to avoid 400 on Insert-Join complexity if permissions overlap
    const { data, error } = await supabase.from('products').insert(payload).select().single();

    if (error) {
        console.error('Error adding product (Supabase):', JSON.stringify(error, null, 2));
        return null;
    }

    return {
        id: data.id,
        businessId: data.business_id,
        businessName: '', // Will be refreshed by loadData() anyway
        name: data.name,
        description: data.description,
        priceRetail: Number(data.price_retail),
        priceWholesale: Number(data.price_wholesale),
        wholesaleMinQty: Number(data.wholesale_min_qty),
        imageUrl: data.image_url,
        images: data.images || [],
        category: data.category,
        type: data.type || 'product',
        status: data.status || 'active',
        createdAt: data.created_at
    };
};

export const updateProduct = async (product: Partial<Product> & { id: string }): Promise<boolean> => {
    const updatePayload: any = {};
    if (product.name) updatePayload.name = product.name;
    if (product.description) updatePayload.description = product.description;
    if (product.priceRetail !== undefined) updatePayload.price_retail = product.priceRetail;
    if (product.priceWholesale !== undefined) updatePayload.price_wholesale = product.priceWholesale;
    if (product.wholesaleMinQty !== undefined) updatePayload.wholesale_min_qty = product.wholesaleMinQty;
    if (product.imageUrl) updatePayload.image_url = product.imageUrl;
    if (product.images) updatePayload.images = product.images;
    if (product.category) updatePayload.category = product.category;
    if (product.type) updatePayload.type = product.type;
    if (product.status) updatePayload.status = product.status;

    const { error } = await supabase.from('products').update(updatePayload).eq('id', product.id);

    if (error) {
        console.error('Error updating product:', error);
        return false;
    }
    return true;
};

export const deleteProduct = async (id: string): Promise<boolean> => {
    const { data, error } = await supabase.from('products').delete().eq('id', id).select();

    if (error) {
        console.error('Error deleting product:', error.message);
        return false;
    }

    if (!data || data.length === 0) {
        return false;
    }

    return true;
};

// Transactions
export const getTransactions = async (): Promise<CommercialTransaction[]> => {
    // We need to join businesses twice: one for provider, one for receiver
    const { data, error } = await supabase
        .from('commercial_transactions')
        .select(`
            *,
            provider:businesses!provider_business_id(name, email, rfc),
            receiver:businesses!receiver_business_id(name, email, rfc)
        `)
        .order('transaction_date', { ascending: false });

    if (error) {
        console.error('Error fetching transactions:', error);
        return [];
    }

    return data.map((t: any) => ({
        id: t.id,
        providerBusinessId: t.provider_business_id,
        providerName: t.provider?.name,
        providerEmail: t.provider_email || t.provider?.email,
        providerRfc: t.provider?.rfc || 'XAXX010101000',
        receiverBusinessId: t.receiver_business_id,
        receiverName: t.receiver?.name,
        receiverEmail: t.receiver_email || t.receiver?.email,
        receiverRfc: t.receiver?.rfc || 'XAXX010101000',
        productId: t.product_id,
        productName: t.product_name,
        quantity: Number(t.quantity),
        unitCost: Number(t.unit_cost),
        totalCost: Number(t.total_cost),
        commission: Number(t.commission) || 0,
        iva: Number(t.iva) || 0,
        status: t.status || 'Pendiente',
        transactionDate: t.transaction_date,
        notes: t.notes,
        createdAt: t.created_at,
        distance: Number(t.distance_km || 0)
    }));
};

export const addTransaction = async (tx: Omit<CommercialTransaction, 'id' | 'createdAt' | 'providerName' | 'receiverName'>): Promise<CommercialTransaction | null> => {
    const { data, error } = await supabase.from('commercial_transactions').insert({
        provider_business_id: tx.providerBusinessId,
        receiver_business_id: tx.receiverBusinessId,
        product_id: tx.productId,
        product_name: tx.productName,
        quantity: tx.quantity,
        unit_cost: tx.unitCost,
        total_cost: tx.totalCost,
        commission: tx.commission || 0,
        iva: tx.iva || 0,
        status: tx.status || 'Pendiente',
        provider_email: tx.providerEmail,
        receiver_email: tx.receiverEmail,
        transaction_date: tx.transactionDate || new Date().toISOString(),
        notes: tx.notes
    }).select().single();

    if (error) {
        console.error('Error adding transaction:', error);
        return null;
    }

    return {
        id: data.id,
        providerBusinessId: data.provider_business_id,
        providerName: '', // Fetch if needed, or rely on reload
        providerEmail: data.provider_email,
        receiverBusinessId: data.receiver_business_id,
        receiverName: '',
        receiverEmail: data.receiver_email,
        productId: data.product_id,
        productName: data.product_name,
        quantity: Number(data.quantity),
        unitCost: Number(data.unit_cost),
        totalCost: Number(data.total_cost),
        status: data.status,
        transactionDate: data.transaction_date,
        notes: data.notes,
        createdAt: data.created_at
    };
};

export const updateTransactionStatus = async (id: string, status: string): Promise<boolean> => {
    const { error } = await supabase.from('commercial_transactions').update({ status }).eq('id', id);
    if (error) {
        console.error('Error updating transaction status:', error);
        return false;
    }
    return true;
};

export const updateTransaction = async (tx: Partial<CommercialTransaction> & { id: string }): Promise<boolean> => {
    const updatePayload: any = {};
    if (tx.providerBusinessId) updatePayload.provider_business_id = tx.providerBusinessId;
    if (tx.providerEmail !== undefined) updatePayload.provider_email = tx.providerEmail;
    if (tx.receiverBusinessId) updatePayload.receiver_business_id = tx.receiverBusinessId;
    if (tx.receiverEmail !== undefined) updatePayload.receiver_email = tx.receiverEmail;
    if (tx.productId) updatePayload.product_id = tx.productId;
    if (tx.productName) updatePayload.product_name = tx.productName;
    if (tx.quantity) updatePayload.quantity = tx.quantity;
    if (tx.unitCost) updatePayload.unit_cost = tx.unitCost;
    if (tx.totalCost) updatePayload.total_cost = tx.totalCost;
    if (tx.commission !== undefined) updatePayload.commission = tx.commission;
    if (tx.iva !== undefined) updatePayload.iva = tx.iva;
    if (tx.status) updatePayload.status = tx.status;
    if (tx.notes !== undefined) updatePayload.notes = tx.notes;

    const { data, error } = await supabase.from('commercial_transactions').update(updatePayload).eq('id', tx.id).select();

    if (error) {
        console.error('Error updating transaction:', error);
        return false;
    }

    if (!data || data.length === 0) {
        console.warn('Update succeeded but no rows were affected. Likely an RLS permission issue or ID mismatch.');
        return false;
    }

    return true;
};


