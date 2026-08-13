-- OpenXPost Pay invoices (postgres). JSON file store is v1.
-- Unique open lamports; unique paid signature; no postText.

CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL,
  treasury      TEXT NOT NULL,
  lamports      BIGINT NOT NULL,
  amount_sol    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'expired')),
  created_at    TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  signature     TEXT,
  paid_at       TIMESTAMPTZ,
  payer         TEXT,
  slot          BIGINT
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_open_lamports
  ON invoices (lamports) WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS invoices_signature
  ON invoices (signature) WHERE signature IS NOT NULL;
