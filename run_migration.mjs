import pg from 'pg';
const { Client } = pg;
const connectStr = 'postgresql://postgres.cgngdeaknmqvyprfayll:ctmguadalupe2025!!..@aws-0-us-west-1.pooler.supabase.com:6543/postgres';
async function run() {
    const c = new Client(connectStr);
    await c.connect();
    
    console.log("Running migration...");
    const sql = `
-- 1. Updates to Trips table
ALTER TABLE trips ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Efectivo';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_settled BOOLEAN DEFAULT FALSE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS receipt_id UUID;

-- 2. Payment Receipts (Auditoría B2B)
CREATE TABLE IF NOT EXISTS payment_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    amount NUMERIC NOT NULL,
    payment_method TEXT NOT NULL,
    reference TEXT,
    client_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
    recorded_by TEXT,
    date TIMESTAMPTZ DEFAULT NOW(),
    trips_covered JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: We check if constraint exists before adding (optional but safe in some envs)
-- For simplicity in a migration script we just run it and catch errors if needed, 
-- but SQL 'ADD COLUMN IF NOT EXISTS' is already safe.
-- We can't easily check constraint existence in a single ALTER block without a function,
-- so we'll just run it. If it fails, we move on.

-- 3. Driver Settlements (Corte de Caja)
CREATE TABLE IF NOT EXISTS driver_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    driver_name TEXT,
    amount NUMERIC NOT NULL,
    settled_by TEXT,
    date TIMESTAMPTZ DEFAULT NOW(),
    trips_covered JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Fleet Expenses (Gastos de Operación)
CREATE TABLE IF NOT EXISTS fleet_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID REFERENCES fleet_units(id) ON DELETE CASCADE,
    expense_type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    recorded_by TEXT,
    notes TEXT,
    mileage NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Set up RLS for new tables
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_expenses ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users
GRANT ALL ON payment_receipts TO authenticated;
GRANT ALL ON driver_settlements TO authenticated;
GRANT ALL ON fleet_expenses TO authenticated;

-- Policies for Authenticated Users (Admins and Users can read/write)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated read access payment_receipts') THEN
        CREATE POLICY "Allow authenticated read access payment_receipts" ON payment_receipts FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated insert access payment_receipts') THEN
        CREATE POLICY "Allow authenticated insert access payment_receipts" ON payment_receipts FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated update access payment_receipts') THEN
        CREATE POLICY "Allow authenticated update access payment_receipts" ON payment_receipts FOR UPDATE TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated delete access payment_receipts') THEN
        CREATE POLICY "Allow authenticated delete access payment_receipts" ON payment_receipts FOR DELETE TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated read access driver_settlements') THEN
        CREATE POLICY "Allow authenticated read access driver_settlements" ON driver_settlements FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated insert access driver_settlements') THEN
        CREATE POLICY "Allow authenticated insert access driver_settlements" ON driver_settlements FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated update access driver_settlements') THEN
        CREATE POLICY "Allow authenticated update access driver_settlements" ON driver_settlements FOR UPDATE TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated delete access driver_settlements') THEN
        CREATE POLICY "Allow authenticated delete access driver_settlements" ON driver_settlements FOR DELETE TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated read access fleet_expenses') THEN
        CREATE POLICY "Allow authenticated read access fleet_expenses" ON fleet_expenses FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated insert access fleet_expenses') THEN
        CREATE POLICY "Allow authenticated insert access fleet_expenses" ON fleet_expenses FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated update access fleet_expenses') THEN
        CREATE POLICY "Allow authenticated update access fleet_expenses" ON fleet_expenses FOR UPDATE TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Allow authenticated delete access fleet_expenses') THEN
        CREATE POLICY "Allow authenticated delete access fleet_expenses" ON fleet_expenses FOR DELETE TO authenticated USING (true);
    END IF;
END $$;

-- Drop old get_public_trip_details and recreate to include payment_method
CREATE OR REPLACE FUNCTION get_public_trip_details(p_trip_id UUID)
RETURNS TABLE (
    id UUID,
    origin TEXT,
    destination TEXT,
    cost NUMERIC,
    client_confirmed BOOLEAN,
    status TEXT,
    confirmed_by_name TEXT,
    client_name TEXT,
    created_at TIMESTAMPTZ,
    payment_method TEXT
) 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id, 
        t.origin, 
        t.destination, 
        t.cost, 
        t.client_confirmed, 
        t.status,
        t.confirmed_by_name,
        COALESCE(b.name, t.passenger_name, 'No especificado') as client_name,
        t.created_at,
        t.payment_method
    FROM trips t
    LEFT JOIN businesses b ON t.business_id = b.id
    WHERE t.id = p_trip_id;
END;
$$;
GRANT EXECUTE ON FUNCTION get_public_trip_details(UUID) TO public;
GRANT EXECUTE ON FUNCTION get_public_trip_details(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_public_trip_details(UUID) TO authenticated;
`;
    await c.query(sql);
    console.log("Migration completed successfully");
    await c.end();
}
run().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
