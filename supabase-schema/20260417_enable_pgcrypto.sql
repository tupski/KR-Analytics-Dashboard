-- Enable pgcrypto for password hashing if needed in custom functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure admin_create_user and admin_update_user functions exist and are correct
-- These are usually defined in previous migrations, but we ensure pgcrypto is there for them.
