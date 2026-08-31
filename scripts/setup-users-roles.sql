-- Fix outlet ID to match default outlet mapping
UPDATE outlets SET id = '11111111-1111-1111-1111-111111111111' WHERE id = '2d143f1d-8c34-477f-9edb-a02717eb37b2';

-- Insert waiter user if missing (with all required fields)
INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, updated_at)
SELECT gen_random_uuid(), 'waiter@hotelkapila.com', '', 'Waiter', 'Staff', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'waiter@hotelkapila.com');

-- Assign user_roles with outlet access to standard system roles
INSERT INTO user_roles (user_id, role_id, outlet_id)
SELECT u.id, r.id, '11111111-1111-1111-1111-111111111111'
FROM users u, roles r
WHERE u.email = 'admin@hotelkapila.com' AND r.name = 'SUPER_ADMIN'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id, outlet_id)
SELECT u.id, r.id, '11111111-1111-1111-1111-111111111111'
FROM users u, roles r
WHERE u.email = 'cashier@hotelkapila.com' AND r.name = 'CASHIER'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id, outlet_id)
SELECT u.id, r.id, '11111111-1111-1111-1111-111111111111'
FROM users u, roles r
WHERE u.email = 'chef@hotelkapila.com' AND r.name = 'KITCHEN_USER'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id, outlet_id)
SELECT u.id, r.id, '11111111-1111-1111-1111-111111111111'
FROM users u, roles r
WHERE u.email = 'waiter@hotelkapila.com' AND r.name = 'WAITER'
ON CONFLICT (user_id, role_id) DO NOTHING;

SELECT 'Setup complete' AS status;
