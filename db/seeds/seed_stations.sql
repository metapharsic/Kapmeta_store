-- Add SLA columns to stations table
ALTER TABLE stations ADD COLUMN IF NOT EXISTS sla_warning_seconds integer DEFAULT 300;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS sla_breach_seconds integer DEFAULT 600;

-- Seed stations for the main outlet if empty
DO $$
DECLARE
  v_outlet_id uuid;
BEGIN
  SELECT id INTO v_outlet_id FROM outlets LIMIT 1;
  IF v_outlet_id IS NOT NULL THEN
    INSERT INTO stations (outlet_id, name, printer_ip, sla_warning_seconds, sla_breach_seconds)
    VALUES
      (v_outlet_id, 'GRILL & TANDOOR', '192.168.1.101', 300, 600),
      (v_outlet_id, 'MAIN KITCHEN / CURRY', '192.168.1.102', 300, 600),
      (v_outlet_id, 'PANTRY & DESSERTS', '192.168.1.103', 180, 360),
      (v_outlet_id, 'BEVERAGE BAR', '192.168.1.104', 120, 240)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
