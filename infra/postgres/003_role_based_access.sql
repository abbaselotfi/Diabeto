-- Future physician authentication will bind a verified identity to one of
-- these roles. Admin-only routes must query this server-side role, never a
-- client-provided flag.
CREATE TYPE user_role AS ENUM ('pending', 'clinician', 'admin');

ALTER TABLE user_account ADD COLUMN role user_role NOT NULL DEFAULT 'pending';
CREATE INDEX user_account_role_lookup ON user_account (organization_id, role, registration_state);
