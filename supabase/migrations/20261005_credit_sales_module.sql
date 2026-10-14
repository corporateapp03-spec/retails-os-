-- ==============================================================================
-- DEBT POS / CREDIT SALES MODULE MIGRATION
-- Completely isolated tables for managing credit sales, items, payments, and reminders.
-- DO NOT alter any existing tables, columns, or views.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.credit_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    total_capital NUMERIC NOT NULL DEFAULT 0 CHECK (total_capital >= 0),
    total_profit NUMERIC NOT NULL DEFAULT 0 CHECK (total_profit >= 0),
    amount_paid NUMERIC NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    remaining_amount NUMERIC NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0),
    capital_recovered NUMERIC NOT NULL DEFAULT 0 CHECK (capital_recovered >= 0),
    profit_recovered NUMERIC NOT NULL DEFAULT 0 CHECK (profit_recovered >= 0),
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.credit_sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_sale_id UUID NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL,
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    cost_price NUMERIC NOT NULL CHECK (cost_price >= 0),
    selling_price NUMERIC NOT NULL CHECK (selling_price >= 0),
    capital_amount NUMERIC NOT NULL CHECK (capital_amount >= 0),
    profit_amount NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_sale_id UUID NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    capital_allocated NUMERIC NOT NULL DEFAULT 0 CHECK (capital_allocated >= 0),
    profit_allocated NUMERIC NOT NULL DEFAULT 0 CHECK (profit_allocated >= 0),
    payment_method TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_sale_id UUID NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL CHECK (reminder_type IN ('due', 'overdue')),
    scheduled_date DATE NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes on new tables
CREATE INDEX IF NOT EXISTS idx_credit_sales_status ON public.credit_sales(status);
CREATE INDEX IF NOT EXISTS idx_credit_sales_due_date ON public.credit_sales(due_date);
CREATE INDEX IF NOT EXISTS idx_credit_sale_items_credit_sale_id ON public.credit_sale_items(credit_sale_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_credit_sale_id ON public.credit_payments(credit_sale_id);
CREATE INDEX IF NOT EXISTS idx_credit_reminders_credit_sale_id ON public.credit_reminders(credit_sale_id);

-- Row Level Security (RLS) on new tables
ALTER TABLE public.credit_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_reminders ENABLE ROW LEVEL SECURITY;

-- Policies for Authenticated Users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'credit_sales' AND policyname = 'Authenticated users can manage credit_sales'
    ) THEN
        CREATE POLICY "Authenticated users can manage credit_sales" ON public.credit_sales
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'credit_sale_items' AND policyname = 'Authenticated users can manage credit_sale_items'
    ) THEN
        CREATE POLICY "Authenticated users can manage credit_sale_items" ON public.credit_sale_items
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'credit_payments' AND policyname = 'Authenticated users can manage credit_payments'
    ) THEN
        CREATE POLICY "Authenticated users can manage credit_payments" ON public.credit_payments
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'credit_reminders' AND policyname = 'Authenticated users can manage credit_reminders'
    ) THEN
        CREATE POLICY "Authenticated users can manage credit_reminders" ON public.credit_reminders
            FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_sales, public.credit_sale_items, public.credit_payments, public.credit_reminders TO authenticated;
REVOKE ALL ON public.credit_sales, public.credit_sale_items, public.credit_payments, public.credit_reminders FROM anon;

-- Realtime Publication for cross-device live updates
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_sales;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_sale_items;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_payments;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_reminders;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;
