import { supabase } from '../supabaseClient';
import { Trip } from './types';

export interface DriverSettlement {
    id: string;
    driverId?: string;
    driverName: string;
    amount: number;
    settledBy: string;
    date: string;
    tripsCovered: string[];
    createdAt: string;
}

export interface PaymentReceipt {
    id: string;
    amount: number;
    paymentMethod: string;
    reference: string;
    clientId?: string;
    recordedBy: string;
    date: string;
    tripsCovered: string[];
    createdAt: string;
}

export interface FleetExpense {
    id: string;
    unitId: string;
    expenseType: string;
    amount: number;
    date: string;
    recordedBy: string;
    notes?: string;
    mileage?: number;
    createdAt: string;
}

// 1. Driver Settlements (Corte de Caja)

export const createDriverSettlement = async (driverName: string, amount: number, tripIds: string[], settledBy: string, driverId?: string): Promise<DriverSettlement | null> => {
    // 1. Create settlement record
    const { data: settlement, error } = await supabase.from('driver_settlements').insert({
        driver_id: driverId || null,
        driver_name: driverName,
        amount: amount,
        settled_by: settledBy,
        trips_covered: tripIds
    }).select().single();

    if (error) {
        console.error('Error creating driver settlement:', error);
        return null;
    }

    // 2. Update trips
    const { error: tripError } = await supabase.from('trips')
        .update({ driver_settled: true })
        .in('id', tripIds);
    
    if (tripError) {
        console.error('Error updating trips for driver settlement:', tripError);
        // We probably shouldn't return null if the settlement was created, but log error
    }

    return {
        id: settlement.id,
        driverId: settlement.driver_id,
        driverName: settlement.driver_name,
        amount: Number(settlement.amount),
        settledBy: settlement.settled_by,
        date: settlement.date,
        tripsCovered: settlement.trips_covered || [],
        createdAt: settlement.created_at
    };
};

export const getDriverSettlements = async (): Promise<DriverSettlement[]> => {
    const { data, error } = await supabase.from('driver_settlements').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error('Error fetching driver settlements:', error);
        return [];
    }
    return data.map((d: any) => ({
        id: d.id,
        driverId: d.driver_id,
        driverName: d.driver_name,
        amount: Number(d.amount),
        settledBy: d.settled_by,
        date: d.date,
        tripsCovered: d.trips_covered || [],
        createdAt: d.created_at
    }));
}


// 2. Payment Receipts (Auditoría B2B)

export const createPaymentReceipt = async (clientId: string, amount: number, paymentMethod: string, reference: string, tripIds: string[], recordedBy: string): Promise<PaymentReceipt | null> => {
    const { data: receipt, error } = await supabase.from('payment_receipts').insert({
        client_id: clientId,
        amount,
        payment_method: paymentMethod,
        reference,
        recorded_by: recordedBy,
        trips_covered: tripIds
    }).select().single();

    if (error) {
        console.error('Error creating payment receipt:', error);
        return null;
    }

    // Update trips to link the receipt and mark as paid
    const { error: tripError } = await supabase.from('trips')
        .update({ 
            receipt_id: receipt.id,
            payment_status: 'Pagado'
        })
        .in('id', tripIds);

    if (tripError) {
        console.error('Error updating trips for payment receipt:', tripError);
    }

    return {
        id: receipt.id,
        amount: Number(receipt.amount),
        paymentMethod: receipt.payment_method,
        reference: receipt.reference,
        clientId: receipt.client_id,
        recordedBy: receipt.recorded_by,
        date: receipt.date,
        tripsCovered: receipt.trips_covered || [],
        createdAt: receipt.created_at
    };
};

export const getPaymentReceipts = async (clientId?: string): Promise<PaymentReceipt[]> => {
    let query = supabase.from('payment_receipts').select('*').order('created_at', { ascending: false });
    if (clientId) {
        query = query.eq('client_id', clientId);
    }
    const { data, error } = await query;
    if (error) {
        console.error('Error fetching payment receipts:', error);
        return [];
    }
    return data.map((r: any) => ({
        id: r.id,
        amount: Number(r.amount),
        paymentMethod: r.payment_method,
        reference: r.reference,
        clientId: r.client_id,
        recordedBy: r.recorded_by,
        date: r.date,
        tripsCovered: r.trips_covered || [],
        createdAt: r.created_at
    }));
};

// 3. Fleet Expenses

export const createFleetExpense = async (unitId: string, expenseType: string, amount: number, recordedBy: string, mileage?: number, notes?: string): Promise<FleetExpense | null> => {
    const { data: expense, error } = await supabase.from('fleet_expenses').insert({
        unit_id: unitId,
        expense_type: expenseType,
        amount,
        recorded_by: recordedBy,
        mileage: mileage || null,
        notes: notes || null
    }).select().single();

    if (error) {
        console.error('Error creating fleet expense:', error);
        return null;
    }

    return {
        id: expense.id,
        unitId: expense.unit_id,
        expenseType: expense.expense_type,
        amount: Number(expense.amount),
        date: expense.date,
        recordedBy: expense.recorded_by,
        notes: expense.notes,
        mileage: expense.mileage ? Number(expense.mileage) : undefined,
        createdAt: expense.created_at
    };
}

export const getFleetExpenses = async (unitId?: string): Promise<FleetExpense[]> => {
    let query = supabase.from('fleet_expenses').select('*').order('created_at', { ascending: false });
    if (unitId) {
        query = query.eq('unit_id', unitId);
    }
    const { data, error } = await query;
    if (error) {
        console.error('Error fetching fleet expenses:', error);
        return [];
    }
    return data.map((e: any) => ({
        id: e.id,
        unitId: e.unit_id,
        expenseType: e.expense_type,
        amount: Number(e.amount),
        date: e.date,
        recordedBy: e.recorded_by,
        notes: e.notes,
        mileage: e.mileage ? Number(e.mileage) : undefined,
        createdAt: e.created_at
    }));
}

export const getFleetExpensesByDateRange = async (startDate: Date, endDate: Date): Promise<FleetExpense[]> => {
    const { data, error } = await supabase.from('fleet_expenses')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching fleet expenses by date range:', error);
        return [];
    }
    return data.map((e: any) => ({
        id: e.id,
        unitId: e.unit_id,
        expenseType: e.expense_type,
        amount: Number(e.amount),
        date: e.date,
        recordedBy: e.recorded_by,
        notes: e.notes,
        mileage: e.mileage ? Number(e.mileage) : undefined,
        createdAt: e.created_at
    }));
}
