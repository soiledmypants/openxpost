export const DEFAULT_SOLANA_RPC = "https://api.mainnet-beta.solana.com";

/** Payment mint. Override with VITE_TOKEN_MINT / TOKEN_MINT. Ticker is $POST. */
export const DEFAULT_TOKEN_MINT = "CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump";

/** Shown on the site. Payment token ticker. */
export const TOKEN_TICKER = "$POST";

/** Locked treasury. Default for VITE_TREASURY_ADDRESS / TREASURY_ADDRESS. */
export const DEFAULT_TREASURY_ADDRESS = "2qd5pRQJQcyBJFkd4P9BGeXoS1zDcwMArRgaTu2zLoMJ";

/** Public placeholder only if the locked default is overridden to empty. */
export const TREASURY_NOT_SET = "TREASURY_NOT_SET";

export const DEFAULT_AMOUNT_TOKENS = 100_000;

/** Example unique quote: amountTokens "100482.722913", raw 100482722913. */
export const EXAMPLE_AMOUNT_UI = "100482.722913";
export const EXAMPLE_AMOUNT_RAW = "100482722913";

export function isTreasuryConfigured(treasury: string): boolean {
  const value = treasury.trim();
  if (!value || value === TREASURY_NOT_SET) return false;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export type CreateInvoiceInput = {
  orderId: string;
  postText: string;
  postTextHash: string;
};

/** Locked createInvoice return. Extra keys may appear; do not rename these. */
export type InvoiceCreated = {
  invoiceId: string;
  receivePubkey: string;
  mint: string;
  amountTokens: number;
  amountUi: string;
  amountRaw: string;
};

/** Locked invoice.paid fields. Reader must accept aliases. */
export type InvoicePaid = {
  type: "invoice.paid";
  invoiceId: string;
  orderId: string;
  txSig: string;
  paidAt: string;
  payer: string;
  amountTokens: number;
  mint: string;
  burnSignature: string;
  slot: number;
};

export type PostTweetSuccess = {
  ok: true;
  tweetId: string;
  tweetUrl: string;
};

export type PostTweetFailure = {
  ok: false;
  error: string;
  retry: boolean;
};

export type PostTweetResponse = PostTweetSuccess | PostTweetFailure;

export type PaymentHit = {
  signature: string;
  slot: number;
  payer: string;
  amountRaw: bigint;
};

export const X_STATUS_PREFIX = "https://x.com/OpenXPost/status/";

export function statusUrl(tweetId: string): string {
  return `${X_STATUS_PREFIX}${tweetId}`;
}

function pick(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/** Parse a paid event, including common alias keys from Pay. */
export function readInvoicePaid(raw: unknown): InvoicePaid | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const nested = o.paid;
  const src =
    nested !== null && typeof nested === "object" && !Array.isArray(nested)
      ? { ...o, ...(nested as Record<string, unknown>) }
      : o;

  const invoiceId = asString(pick(src, ["invoiceId", "invoice_id", "id"]));
  const orderId = asString(pick(src, ["orderId", "order_id"]));
  const txSig = asString(
    pick(src, ["txSig", "tx_sig", "signature", "transferSignature", "paymentSignature", "sig"]),
  );
  const burnSignature = asString(
    pick(src, ["burnSignature", "burn_signature", "burnTx", "burnSig", "burnTxSig", "burn_tx"]),
  );
  const mint = asString(pick(src, ["mint", "tokenMint", "token_mint"]));
  const amountTokens = asNumber(pick(src, ["amountTokens", "amount_tokens", "amount"]));
  const payer = asString(pick(src, ["payer", "from", "source"]));
  const paidAt = asString(pick(src, ["paidAt", "paid_at", "finalizedAt"]));
  const slot = asNumber(pick(src, ["slot"]));

  if (!invoiceId || !orderId || !txSig || !burnSignature || !mint || !Number.isFinite(amountTokens)) {
    return null;
  }

  return {
    type: "invoice.paid",
    invoiceId,
    orderId,
    txSig,
    paidAt: paidAt || new Date().toISOString(),
    payer,
    amountTokens,
    mint,
    burnSignature,
    slot: Number.isFinite(slot) ? slot : 0,
  };
}
