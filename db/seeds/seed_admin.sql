-- Seed: initial admin user, organization, and outlet
DO $$
DECLARE
  v_org_id uuid;
  v_outlet_id uuid;
  v_role_id uuid;
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE email = 'admin@restaurant.com';
  IF v_user_id IS NOT NULL THEN
    SELECT id INTO v_outlet_id FROM outlets LIMIT 1;
    RAISE NOTICE 'Already seeded. outlet_id=%', v_outlet_id;
    RETURN;
  END IF;
  v_org_id := gen_random_uuid();
  v_outlet_id := gen_random_uuid();
  v_role_id := gen_random_uuid();
  v_user_id := gen_random_uuid();
  INSERT INTO organizations(id, name) VALUES (v_org_id, 'My Restaurant');
  INSERT INTO outlets(id, organization_id, code, name) VALUES (v_outlet_id, v_org_id, 'MAIN', 'Main Outlet');
  INSERT INTO roles(id, code, name) VALUES (v_role_id, 'ADMIN', 'Administrator') ON CONFLICT (code) DO UPDATE SET id=roles.id RETURNING id INTO v_role_id;
  INSERT INTO users(id, email, password_hash, full_name, first_name, last_name, is_active) VALUES (v_user_id, 'admin@restaurant.com', '$2a$10$WWdwQawj6TX6cTHzLRDwk.61WW84FIPwWE3r1FHsQq06dkpHVoWs.', 'Admin User', 'Admin', 'User', true);
  INSERT INTO user_roles(user_id, role_id, outlet_id) VALUES (v_user_id, v_role_id, NULL);
  RAISE NOTICE 'Seeded. outlet_id=%', v_outlet_id;
END $$;
SELECT id AS outlet_id, name FROM outlets LIMIT 3;
