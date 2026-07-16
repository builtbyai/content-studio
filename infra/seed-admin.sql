-- One-shot admin seed. Replace SALT and HASH with values produced by
-- `node infra/hash-password.mjs <password>` BEFORE running.
--
-- Format must match the auth module: password_hash = SHA-256(password || salt) as lowercase hex.
-- Matches the reference auth service's existing convention so the admin@example.com row is portable.

INSERT INTO users (id, email, password_hash, salt, role, created_at)
VALUES (
  'usr_admin_demo',
  'admin@example.com',
  'REPLACE_WITH_HASH',
  'REPLACE_WITH_SALT',
  'admin',
  strftime('%s', 'now')
);
