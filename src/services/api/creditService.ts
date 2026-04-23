import { supabase } from '../supabaseClient';
import { Trip } from './types';

// Let's assume types is already exported
export interface CompanyCredit {
    id: string;
    businessId: string;
    creditAmount: number;
    period: 'semanal' | 'quincenal' | 'mensual' | 'ninguno';
    createdAt: string;
    updatedAt: string;
}

export const getCompanyCredits = async (): Promise<CompanyCredit[]> => {
    const { data, error } = await supabase
        .from('company_credits')
        .select('*');

    if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
            console.warn('Tabla company_credits no existe. Usando Mock LocalStorage.');
            const localData = localStorage.getItem('mock_company_credits');
            return localData ? JSON.parse(localData) : [];
        }
        console.error('Error fetching company credits:', error);
        return [];
    }

    return data.map((c: any) => ({
        id: c.id,
        businessId: c.business_id,
        creditAmount: Number(c.credit_amount),
        period: c.period,
        createdAt: c.created_at,
        updatedAt: c.updated_at
    }));
};

export const upsertCompanyCredit = async (credit: Omit<CompanyCredit, 'id' | 'createdAt' | 'updatedAt'>): Promise<boolean> => {
    const payload = {
        business_id: credit.businessId,
        credit_amount: credit.creditAmount,
        period: credit.period,
        updated_at: new Date().toISOString()
    };

    const { error } = await supabase
        .from('company_credits')
        .upsert(payload, { onConflict: 'business_id' });

    if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
            console.warn('Tabla company_credits no existe. Usando Mock LocalStorage para guardar.');
            const localData = localStorage.getItem('mock_company_credits');
            let credits: CompanyCredit[] = localData ? JSON.parse(localData) : [];
            const index = credits.findIndex(c => c.businessId === credit.businessId);
            const newCredit: CompanyCredit = {
                id: crypto.randomUUID(),
                businessId: credit.businessId,
                creditAmount: credit.creditAmount,
                period: credit.period,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            if (index >= 0) {
                credits[index] = { ...credits[index], ...newCredit, id: credits[index].id, createdAt: credits[index].createdAt };
            } else {
                credits.push(newCredit);
            }
            localStorage.setItem('mock_company_credits', JSON.stringify(credits));
            return true;
        }
        console.error('Error upserting company credit:', error);
        return false;
    }
    return true;
};
