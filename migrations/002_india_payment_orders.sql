CREATE TABLE payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  provider_order_id TEXT UNIQUE,
  provider_payment_id TEXT UNIQUE,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING',
  description TEXT,
  ledger_transaction_id UUID UNIQUE REFERENCES transactions(id),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  credited_at TIMESTAMPTZ,
  CONSTRAINT payment_orders_amount_positive CHECK (amount > 0),
  CONSTRAINT payment_orders_currency_uppercase CHECK (currency = UPPER(currency)),
  CONSTRAINT payment_orders_provider_supported CHECK (provider IN ('RAZORPAY')),
  CONSTRAINT payment_orders_status_valid CHECK (
    status IN ('CREATING', 'CREATED', 'CREDITED', 'FAILED')
  ),
  CONSTRAINT payment_orders_idempotency_length CHECK (
    LENGTH(idempotency_key) BETWEEN 8 AND 128
  ),
  CONSTRAINT payment_orders_user_idempotency_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT payment_orders_state_shape CHECK (
    (status = 'CREATING' AND provider_order_id IS NULL AND ledger_transaction_id IS NULL)
    OR
    (status = 'CREATED' AND provider_order_id IS NOT NULL AND ledger_transaction_id IS NULL)
    OR
    (status = 'CREDITED' AND provider_order_id IS NOT NULL
      AND provider_payment_id IS NOT NULL AND ledger_transaction_id IS NOT NULL
      AND credited_at IS NOT NULL)
    OR
    (status = 'FAILED' AND ledger_transaction_id IS NULL)
  )
);

CREATE INDEX payment_orders_user_created_idx
  ON payment_orders (user_id, created_at DESC);
CREATE INDEX payment_orders_status_updated_idx
  ON payment_orders (status, updated_at);

CREATE TABLE provider_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT provider_webhook_events_provider_supported CHECK (provider IN ('RAZORPAY')),
  CONSTRAINT provider_webhook_events_status_valid CHECK (
    status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')
  ),
  CONSTRAINT provider_webhook_events_unique UNIQUE (provider, provider_event_id)
);

CREATE INDEX provider_webhook_events_status_received_idx
  ON provider_webhook_events (status, received_at);

INSERT INTO accounts (account_type, system_code, currency)
VALUES
  ('SYSTEM', 'EXTERNAL_FUNDING', 'INR'),
  ('SYSTEM', 'WITHDRAWAL_CLEARING', 'INR')
ON CONFLICT DO NOTHING;

INSERT INTO accounts (user_id, account_type, currency)
SELECT id, 'WALLET', 'INR'
FROM users
ON CONFLICT DO NOTHING;
