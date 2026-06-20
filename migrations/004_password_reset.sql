ALTER TABLE users
  ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT users_auth_version_positive CHECK (auth_version > 0);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT password_reset_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT password_reset_consumed_after_creation CHECK (
    consumed_at IS NULL OR consumed_at >= created_at
  )
);

CREATE INDEX password_reset_tokens_user_created_idx
  ON password_reset_tokens (user_id, created_at DESC);

CREATE INDEX password_reset_tokens_expiry_idx
  ON password_reset_tokens (expires_at)
  WHERE consumed_at IS NULL;

COMMENT ON COLUMN users.auth_version IS
  'Incremented after security-sensitive credential changes to invalidate all JWT sessions.';

COMMENT ON TABLE password_reset_tokens IS
  'Single-use password-reset grants. Only SHA-256 token hashes are stored.';
