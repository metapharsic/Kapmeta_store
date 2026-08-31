-- 1. Create menu_categories if not exists
CREATE TABLE IF NOT EXISTS menu_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id uuid NOT NULL REFERENCES outlets (id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    online_display_name text,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_menu_categories_outlet_name ON menu_categories (outlet_id, name);
CREATE INDEX IF NOT EXISTS ix_menu_categories_outlet_id ON menu_categories (outlet_id);

-- 2. Ensure menu_items has price and tax_rate
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price numeric(12,2) DEFAULT 0.00;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) DEFAULT 5.00;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS code text;

-- 3. Seed Menu Categories and Items for the outlet
DO $$
DECLARE
  v_outlet_id uuid;
  v_cat_biryani_id uuid := gen_random_uuid();
  v_cat_starters_id uuid := gen_random_uuid();
  v_cat_beverages_id uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_outlet_id FROM outlets LIMIT 1;
  IF v_outlet_id IS NOT NULL THEN
    -- Categories
    INSERT INTO menu_categories (id, outlet_id, name, description, sort_order)
    VALUES
      (v_cat_biryani_id, v_outlet_id, 'Biryani Specials', 'Authentic Dum Biryani', 1),
      (v_cat_starters_id, v_outlet_id, 'Starters & Tandoor', 'Crispy and Grilled Appetizers', 2),
      (v_cat_beverages_id, v_outlet_id, 'Beverages & Mocktails', 'Cold drinks and shakes', 3)
    ON CONFLICT (outlet_id, name) DO NOTHING;

    -- Also insert into categories table if exists
    INSERT INTO categories (id, outlet_id, name, sort_order)
    VALUES
      (v_cat_biryani_id, v_outlet_id, 'Biryani Specials', 1),
      (v_cat_starters_id, v_outlet_id, 'Starters & Tandoor', 2),
      (v_cat_beverages_id, v_outlet_id, 'Beverages & Mocktails', 3)
    ON CONFLICT DO NOTHING;

    -- Menu Items
    INSERT INTO menu_items (outlet_id, category_id, name, description, price, is_veg, is_active)
    VALUES
      (v_outlet_id, v_cat_biryani_id, 'Chicken Dum Biryani (Special)', 'Signature spiced chicken biryani with salan', 320.00, false, true),
      (v_outlet_id, v_cat_biryani_id, 'Paneer Tikka Biryani', 'Fresh paneer cubes in fragrant dum rice', 260.00, true, true),
      (v_outlet_id, v_cat_starters_id, 'Murgh Malai Tikka', 'Tender boneless chicken in creamy marinade', 290.00, false, true),
      (v_outlet_id, v_cat_starters_id, 'Crispy Corn Salt & Pepper', 'Sweet corn tossed with peppers and scallions', 190.00, true, true),
      (v_outlet_id, v_cat_beverages_id, 'Fresh Mint Mojito', 'Crushed mint, lime and sparkling soda', 120.00, true, true),
      (v_outlet_id, v_cat_beverages_id, 'Mango Lassi', 'Rich sweet yogurt shake with mango pulp', 90.00, true, true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
