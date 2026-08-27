-- Seed All Permissions and grant them to ADMIN role
DO $$
DECLARE
  v_admin_role_id uuid;
  v_perm_id uuid;
  p_code text;
  v_perms text[] := ARRAY[
    'order.create', 'order.read', 'order.update', 'order.cancel', 'order.discount',
    'kot.create', 'kot.read', 'kot.update', 'kot.recall', 'kot.manage',
    'table.read', 'table.transfer', 'table.merge', 'table.split', 'table.manage',
    'bill.generate', 'bill.settle', 'bill.reprint', 'bill.split',
    'payment.collect', 'payment.refund', 'payment.split',
    'menu.read', 'menu.category.manage', 'menu.item.manage', 'menu.86.toggle',
    'inventory.read', 'inventory.stock.adjust', 'inventory.po.create', 'inventory.po.approve', 'inventory.grn.create', 'inventory.write', 'inventory.stock.deduct',
    'report.read', 'report.financial.read', 'report.audit.read', 'report.export', 'report.zreport',
    'finance.report', 'finance.cash_drawer.manage', 'finance.petty_cash.record',
    'crm.read', 'crm.write', 'crm.loyalty.redeem', 'crm.loyalty.issue',
    'settings.read', 'settings.manage', 'users.manage', 'users.read', 'outlets.manage', 'roles.manage',
    'integration.manage', 'integration.sync', 'audit.read'
  ];
BEGIN
  -- Get ADMIN role
  SELECT id INTO v_admin_role_id FROM roles WHERE code = 'ADMIN' LIMIT 1;
  IF v_admin_role_id IS NULL THEN
    v_admin_role_id := gen_random_uuid();
    INSERT INTO roles (id, code, name, description)
    VALUES (v_admin_role_id, 'ADMIN', 'Administrator', 'Full system access');
  END IF;

  FOREACH p_code IN ARRAY v_perms LOOP
    -- Insert permission
    INSERT INTO permissions (id, code, module, description)
    VALUES (gen_random_uuid(), p_code, split_part(p_code, '.', 1), 'Permission for ' || p_code)
    ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_perm_id;

    -- Link to ADMIN role
    INSERT INTO role_permissions (role_id, permission_id)
    VALUES (v_admin_role_id, v_perm_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Permissions successfully seeded for ADMIN role!';
END $$;
