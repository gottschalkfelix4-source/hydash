-- HyDash Database Seed - Migration 002
-- Seed admin user and default data

-- Create admin user (password: Admin123!)
-- bcrypt hash generated for 'Admin123!'
INSERT INTO users (email, password_hash, display_name, legacy_role, is_active)
VALUES (
    'admin@hydash.local',
    '$2a$12$fjH4hm1tE9TLoMqfBWttreaWFKZM8zVM6wImLuWCbZPIsOqgxyzXO',
    'Administrator',
    'admin',
    true
) ON CONFLICT (email) DO NOTHING;

-- Assign admin role to the seeded user
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'admin@hydash.local' AND r.name = 'admin'
ON CONFLICT (user_id, role_id) DO NOTHING;