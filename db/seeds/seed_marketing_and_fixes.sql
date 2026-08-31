-- 1. Marketing Campaigns Table
CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets (id) ON DELETE CASCADE,
    name text NOT NULL,
    trigger_type text NOT NULL DEFAULT 'MANUAL',
    segment_filter jsonb,
    discount_id uuid,
    message_template text NOT NULL,
    status text NOT NULL DEFAULT 'DRAFT',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_outlet ON marketing_campaigns (outlet_id);

-- 2. Campaign Recipients Table
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES marketing_campaigns (id) ON DELETE CASCADE,
    customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'PENDING',
    sent_at timestamptz,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients (campaign_id);

-- 3. Order Payments extra columns
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS method text DEFAULT 'CASH';
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS status text DEFAULT 'CAPTURED';
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS seat_number integer;

-- 4. Order Items extra columns
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_voided boolean DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS seat_number integer;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS course text;

-- 5. Customers extra columns
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
