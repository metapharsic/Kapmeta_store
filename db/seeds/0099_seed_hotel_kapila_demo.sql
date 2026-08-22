-- 0099_seed_hotel_kapila_demo.sql
--
-- *** SEED DATA -- NOT A SCHEMA MIGRATION ***
-- This file is intentionally numbered far outside the ordered 0001-0015
-- schema-build sequence so it is never mistaken for one. It exists solely
-- to prove that Kapmeta's business/tenant data (outlets, taxes, payment
-- types, menu, tables) lives in real admin-editable tables reachable via a
-- real INSERT path -- not hardcoded into service code -- per project rule.
--
-- Run ONLY after 0001-0015 have been applied. Safe to re-run against a
-- fresh database; not idempotent against a database that already has this
-- seed applied (will raise unique-constraint violations on rerun -- that
-- is deliberate, to avoid silently duplicating demo data).
--
-- Demo tenant: "Hotel kapila" -- matches the real captured evidence used
-- during Phase 0 planning (Breakfast category with Idly/Vada/Dosa variant
-- items; CGST/SGST backward tax for dine-in + CGST[Online]/SGST[Online]
-- forward tax for online, all at 2.5%; a custom "Other (Room Service)"
-- payment type; AC/Non-AC table zones).

-- +migrate Up

DO $$
DECLARE
    v_outlet_id            uuid;
    v_admin_user_id        uuid;
    v_category_id          uuid;
    v_item_idly_id         uuid;
    v_item_vada_id         uuid;
    v_item_dosa_id         uuid;
    v_tax_cgst_id          uuid;
    v_tax_sgst_id          uuid;
    v_tax_cgst_online_id   uuid;
    v_tax_sgst_online_id   uuid;
BEGIN
    -- Outlet
    INSERT INTO outlets (name, legal_name, city, state, country, gstin, default_tax_mode, is_active)
    VALUES ('Hotel kapila', 'Hotel Kapila Pvt Ltd', 'Bengaluru', 'Karnataka', 'IN', '29ABCDE1234F1Z5', 'backward', true)
    RETURNING id INTO v_outlet_id;

    -- Admin user (password_hash is a placeholder -- real hashing happens app-side)
    INSERT INTO users (outlet_id, name, phone, role, password_hash, is_active)
    VALUES (v_outlet_id, 'Kapila Admin', '9900000000', 'owner', 'PLACEHOLDER_HASH_NOT_A_REAL_PASSWORD', true)
    RETURNING id INTO v_admin_user_id;

    -- Menu category
    INSERT INTO menu_categories (outlet_id, name, online_display_name, sort_order, is_active)
    VALUES (v_outlet_id, 'Breakfast', 'Breakfast', 1, true)
    RETURNING id INTO v_category_id;

    -- Menu items: Idly/Vada/Dosa variants seen in the captured evidence
    INSERT INTO menu_items (outlet_id, category_id, code, name, online_display_name, price, veg_flag, sort_order, is_active)
    VALUES (v_outlet_id, v_category_id, 'BRK-IDLY', 'Idly (2 pcs)', 'Idly', 40.00, 'veg', 1, true)
    RETURNING id INTO v_item_idly_id;

    INSERT INTO menu_items (outlet_id, category_id, code, name, online_display_name, price, veg_flag, sort_order, is_active)
    VALUES (v_outlet_id, v_category_id, 'BRK-VADA', 'Vada (2 pcs)', 'Vada', 40.00, 'veg', 2, true)
    RETURNING id INTO v_item_vada_id;

    INSERT INTO menu_items (outlet_id, category_id, code, name, online_display_name, price, veg_flag, sort_order, is_active)
    VALUES (v_outlet_id, v_category_id, 'BRK-DOSA-PLN', 'Plain Dosa', 'Plain Dosa', 60.00, 'veg', 3, true)
    RETURNING id INTO v_item_dosa_id;

    INSERT INTO menu_items (outlet_id, category_id, code, name, online_display_name, price, veg_flag, sort_order, is_active)
    VALUES (v_outlet_id, v_category_id, 'BRK-DOSA-MSL', 'Masala Dosa', 'Masala Dosa', 80.00, 'veg', 4, true);

    INSERT INTO menu_items (outlet_id, category_id, code, name, online_display_name, price, veg_flag, sort_order, is_active)
    VALUES (v_outlet_id, v_category_id, 'BRK-DOSA-SET', 'Set Dosa (3 pcs)', 'Set Dosa', 70.00, 'veg', 5, true);

    -- Channel visibility + availability for the three key items
    INSERT INTO menu_item_channel_status (outlet_id, menu_item_id, channel, is_enabled, updated_by)
    VALUES
        (v_outlet_id, v_item_idly_id, 'dine_in', true, v_admin_user_id),
        (v_outlet_id, v_item_idly_id, 'online', true, v_admin_user_id),
        (v_outlet_id, v_item_vada_id, 'dine_in', true, v_admin_user_id),
        (v_outlet_id, v_item_vada_id, 'online', true, v_admin_user_id),
        (v_outlet_id, v_item_dosa_id, 'dine_in', true, v_admin_user_id),
        (v_outlet_id, v_item_dosa_id, 'online', true, v_admin_user_id);

    INSERT INTO menu_item_availability (outlet_id, menu_item_id, is_out_of_stock, updated_by)
    VALUES
        (v_outlet_id, v_item_idly_id, false, v_admin_user_id),
        (v_outlet_id, v_item_vada_id, false, v_admin_user_id),
        (v_outlet_id, v_item_dosa_id, false, v_admin_user_id);

    -- Taxes: the real 4-row CGST/SGST backward + forward pair at 2.5% each
    INSERT INTO taxes (outlet_id, name, rate_percent, is_active)
    VALUES (v_outlet_id, 'CGST', 2.500, true) RETURNING id INTO v_tax_cgst_id;
    INSERT INTO taxes (outlet_id, name, rate_percent, is_active)
    VALUES (v_outlet_id, 'SGST', 2.500, true) RETURNING id INTO v_tax_sgst_id;
    INSERT INTO taxes (outlet_id, name, rate_percent, is_active)
    VALUES (v_outlet_id, 'CGST [Online]', 2.500, true) RETURNING id INTO v_tax_cgst_online_id;
    INSERT INTO taxes (outlet_id, name, rate_percent, is_active)
    VALUES (v_outlet_id, 'SGST [Online]', 2.500, true) RETURNING id INTO v_tax_sgst_online_id;

    -- Channel scoping: backward for dine_in, forward for online
    INSERT INTO tax_channel_rules (outlet_id, tax_id, channel, mode, is_active)
    VALUES
        (v_outlet_id, v_tax_cgst_id, 'dine_in', 'backward', true),
        (v_outlet_id, v_tax_sgst_id, 'dine_in', 'backward', true),
        (v_outlet_id, v_tax_cgst_online_id, 'online', 'forward', true),
        (v_outlet_id, v_tax_sgst_online_id, 'online', 'forward', true);

    -- Payment types, including the custom "Other (Room Service)" label
    INSERT INTO payment_type_master (outlet_id, label, is_online, is_active, sort_order)
    VALUES
        (v_outlet_id, 'Cash', false, true, 1),
        (v_outlet_id, 'Card', false, true, 2),
        (v_outlet_id, 'UPI', true, true, 3),
        (v_outlet_id, 'Other (Room Service)', false, true, 4);

    -- Restaurant tables in AC / Non-AC zones
    INSERT INTO restaurant_tables (outlet_id, zone, table_no, capacity, is_active)
    VALUES
        (v_outlet_id, 'AC', 'A1', 4, true),
        (v_outlet_id, 'AC', 'A2', 4, true),
        (v_outlet_id, 'Non-AC', 'N1', 2, true),
        (v_outlet_id, 'Non-AC', 'N2', 6, true);

    -- Default billing/print settings rows for the outlet
    INSERT INTO outlet_billing_settings (outlet_id, bill_prefix, kot_prefix)
    VALUES (v_outlet_id, 'HK-B-', 'HK-K-');

    INSERT INTO outlet_print_settings (outlet_id, printer_name)
    VALUES (v_outlet_id, 'Front Counter Thermal Printer');
END $$;

-- +migrate Down

-- Down migration removes only the demo rows for outlet name 'Hotel kapila'.
-- Ordered to respect FK dependencies (children before parents).
DO $$
DECLARE
    v_outlet_id uuid;
BEGIN
    SELECT id INTO v_outlet_id FROM outlets WHERE name = 'Hotel kapila' LIMIT 1;

    IF v_outlet_id IS NOT NULL THEN
        DELETE FROM outlet_print_settings WHERE outlet_id = v_outlet_id;
        DELETE FROM outlet_billing_settings WHERE outlet_id = v_outlet_id;
        DELETE FROM restaurant_tables WHERE outlet_id = v_outlet_id;
        DELETE FROM payment_type_master WHERE outlet_id = v_outlet_id;
        DELETE FROM tax_channel_rules WHERE outlet_id = v_outlet_id;
        DELETE FROM taxes WHERE outlet_id = v_outlet_id;
        DELETE FROM menu_item_availability WHERE outlet_id = v_outlet_id;
        DELETE FROM menu_item_channel_status WHERE outlet_id = v_outlet_id;
        DELETE FROM menu_items WHERE outlet_id = v_outlet_id;
        DELETE FROM menu_categories WHERE outlet_id = v_outlet_id;
        DELETE FROM users WHERE outlet_id = v_outlet_id;
        DELETE FROM outlets WHERE id = v_outlet_id;
    END IF;
END $$;
