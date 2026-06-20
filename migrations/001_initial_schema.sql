CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE account_type AS ENUM ('WALLET', 'SYSTEM');
CREATE TYPE transaction_type AS ENUM ('DEPOSIT', 'TRANSFER', 'WITHDRAWAL');
CREATE TYPE transaction_status AS ENUM ('POSTED');
CREATE TYPE entry_type AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE idempotency_status AS ENUM ('IN_PROGRESS', 'COMPLETED');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_normalized CHECK (email = LOWER(email)),
  CONSTRAINT users_email_not_blank CHECK (LENGTH(BTRIM(email)) > 3),
  CONSTRAINT users_full_name_not_blank CHECK (LENGTH(BTRIM(full_name)) > 0)
);

CREATE UNIQUE INDEX users_email_unique ON users (email);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  account_type account_type NOT NULL,
  system_code TEXT,
  currency CHAR(3) NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_currency_uppercase CHECK (currency = UPPER(currency)),
  CONSTRAINT accounts_owner_shape CHECK (
    (account_type = 'WALLET' AND user_id IS NOT NULL AND system_code IS NULL)
    OR
    (account_type = 'SYSTEM' AND user_id IS NULL AND system_code IS NOT NULL)
  )
);

CREATE UNIQUE INDEX accounts_user_currency_unique
  ON accounts (user_id, currency)
  WHERE account_type = 'WALLET';

CREATE UNIQUE INDEX accounts_system_currency_unique
  ON accounts (system_code, currency)
  WHERE account_type = 'SYSTEM';

CREATE INDEX accounts_user_id_idx ON accounts (user_id);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type transaction_type NOT NULL,
  status transaction_status NOT NULL DEFAULT 'POSTED',
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  source_account_id UUID NOT NULL REFERENCES accounts(id),
  destination_account_id UUID NOT NULL REFERENCES accounts(id),
  external_reference TEXT,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_amount_positive CHECK (amount > 0),
  CONSTRAINT transactions_currency_uppercase CHECK (currency = UPPER(currency)),
  CONSTRAINT transactions_distinct_accounts CHECK (source_account_id <> destination_account_id)
);

CREATE INDEX transactions_source_created_idx
  ON transactions (source_account_id, created_at DESC, id DESC);
CREATE INDEX transactions_destination_created_idx
  ON transactions (destination_account_id, created_at DESC, id DESC);
CREATE INDEX transactions_type_created_idx ON transactions (type, created_at DESC);

CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  entry_type entry_type NOT NULL,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT entries_amount_direction CHECK (
    (entry_type = 'DEBIT' AND amount < 0)
    OR
    (entry_type = 'CREDIT' AND amount > 0)
  ),
  CONSTRAINT entries_currency_uppercase CHECK (currency = UPPER(currency)),
  CONSTRAINT entries_transaction_account_unique UNIQUE (transaction_id, account_id)
);

CREATE INDEX entries_account_created_idx ON entries (account_id, created_at DESC, id DESC);
CREATE INDEX entries_transaction_idx ON entries (transaction_id);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id, created_at DESC);
CREATE INDEX refresh_tokens_expiry_idx ON refresh_tokens (expires_at);

CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status idempotency_status NOT NULL DEFAULT 'IN_PROGRESS',
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT idempotency_key_length CHECK (LENGTH(idempotency_key) BETWEEN 8 AND 128),
  CONSTRAINT idempotency_completed_shape CHECK (
    (status = 'IN_PROGRESS' AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR
    (status = 'COMPLETED' AND response_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT idempotency_user_key_endpoint_unique UNIQUE (user_id, idempotency_key, endpoint)
);

CREATE INDEX idempotency_expiry_idx ON idempotency_keys (expires_at);

CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are append-only and cannot be updated or deleted'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER entries_are_immutable
BEFORE UPDATE OR DELETE ON entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entry_mutation();

CREATE OR REPLACE FUNCTION apply_entry_to_cached_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE accounts
  SET balance = balance + NEW.amount,
      updated_at = NOW()
  WHERE id = NEW.account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account % does not exist', NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER entries_update_cached_balance
AFTER INSERT ON entries
FOR EACH ROW EXECUTE FUNCTION apply_entry_to_cached_balance();

CREATE OR REPLACE FUNCTION enforce_balanced_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  checked_transaction_id UUID;
  entry_count INTEGER;
  entry_sum NUMERIC;
  currency_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    checked_transaction_id := NEW.id;
  ELSE
    checked_transaction_id := NEW.transaction_id;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0), COUNT(DISTINCT currency)
    INTO entry_count, entry_sum, currency_count
  FROM entries
  WHERE transaction_id = checked_transaction_id;

  IF entry_count < 2 OR entry_sum <> 0 OR currency_count <> 1 THEN
    RAISE EXCEPTION 'transaction % is not balanced: entries=%, sum=%, currencies=%',
      checked_transaction_id, entry_count, entry_sum, currency_count
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER transactions_require_balanced_entries
AFTER INSERT ON transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_balanced_transaction();

CREATE CONSTRAINT TRIGGER entries_require_balanced_transaction
AFTER INSERT ON entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_balanced_transaction();

INSERT INTO accounts (account_type, system_code, currency)
VALUES
  ('SYSTEM', 'EXTERNAL_FUNDING', 'USD'),
  ('SYSTEM', 'WITHDRAWAL_CLEARING', 'USD');
