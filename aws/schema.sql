CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  display_name TEXT,
  iban TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  date_from DATE,
  date_to DATE,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  raw_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_transaction_key TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL,
  transaction_id TEXT,
  booking_date DATE,
  value_date DATE,
  amount NUMERIC(14, 2),
  currency TEXT,
  creditor_name TEXT,
  debtor_name TEXT,
  description TEXT,
  bank_transaction_code TEXT,
  proprietary_bank_transaction_code TEXT,
  short_description TEXT,
  override_month TEXT,
  travel_tag TEXT,
  account_friendly_name TEXT,
  raw_transaction JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_run_id BIGINT REFERENCES sync_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_transaction_key)
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_date
  ON transactions (account_id, booking_date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_booking_date
  ON transactions (booking_date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_description
  ON transactions USING gin (to_tsvector('simple', coalesce(description, '')));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS override_month TEXT,
  ADD COLUMN IF NOT EXISTS travel_tag TEXT,
  ADD COLUMN IF NOT EXISTS account_friendly_name TEXT;

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  bucket TEXT NOT NULL DEFAULT 'Other',
  type TEXT NOT NULL DEFAULT 'Need',
  actual_expense TEXT NOT NULL DEFAULT 'Yes',
  regular_expense TEXT NOT NULL DEFAULT 'Yes',
  frequency TEXT NOT NULL DEFAULT 'Everyday Expense',
  monthly_budget NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transaction_category_overrides (
  transaction_id BIGINT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transaction_category_overrides_category
  ON transaction_category_overrides (category_name);
