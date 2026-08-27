-- 1. Dining Tables Table
CREATE TABLE IF NOT EXISTS dining_tables (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets (id) ON DELETE CASCADE,
    table_number text NOT NULL,
    capacity integer DEFAULT 4,
    section text DEFAULT 'General',
    status text DEFAULT 'VACANT',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dining_tables_outlet_number ON dining_tables (outlet_id, table_number);
CREATE INDEX IF NOT EXISTS idx_dining_tables_outlet ON dining_tables (outlet_id);

-- 2. User Quick Links Table
CREATE TABLE IF NOT EXISTS user_quick_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    label text NOT NULL,
    href text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_quick_links_user ON user_quick_links (user_id);

-- 3. Seed Dining Tables for Main Outlet
DO $$
DECLARE
  v_outlet_id uuid;
BEGIN
  SELECT id INTO v_outlet_id FROM outlets LIMIT 1;
  IF v_outlet_id IS NOT NULL THEN
    INSERT INTO dining_tables (outlet_id, table_number, capacity, section, status)
    VALUES
      (v_outlet_id, 'T-01', 4, 'Indoor AC', 'VACANT'),
      (v_outlet_id, 'T-02', 4, 'Indoor AC', 'VACANT'),
      (v_outlet_id, 'T-03', 6, 'Indoor AC', 'VACANT'),
      (v_outlet_id, 'T-04', 2, 'Terrace', 'VACANT'),
      (v_outlet_id, 'T-05', 4, 'Terrace', 'VACANT'),
      (v_outlet_id, 'T-06', 8, 'Family Section', 'VACANT')
    ON CONFLICT (outlet_id, table_number) DO NOTHING;
  END IF;
END $$;
