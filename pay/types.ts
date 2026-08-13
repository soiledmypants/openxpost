export const DEFAULT_SOLANA_RPC = "https://api.mainnet-beta.solana.com";
export const DEFAULT_TOKEN_MINT = "CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump";
/** Whole tokens. Test mint is Token-2022 with 6 decimals: 100_000 * 10^6 = 100_000_000_000 raw. */
export const DEFAULT_TOKEN_AMOUNT = 100_000;
export const QUOTE_TTL_MS = 15 * 60 * 1000;

export type InvoiceSource = "api" | "demo" | "offline";

/** createInvoice-style quote. Browser never holds the receive wallet secret. */
export type Invoice = {
  invoiceId: string;
  orderId: string;
  mint: string;
  amountTokens: number;
  receivePubkey: string;
  expiresAt: number;
  createdAt: number;
  source: InvoiceSource;
};

export type InvoicePaid = {
  type: "invoice.paid";
  invoiceId: string;
  orderId: string;
  amountTokens: number;
  mint: string;
  fromPubkey: string;
  signature: string;
  burnSignature: string;
  paidAt: number;
  postText: string;
  postTextHash: string;
};

export type PaymentHit = {
  signature: string;
  fromPubkey: string;
  amountRaw: bigint;
  slot: number;
};

export type MintMeta = {
  mint: string;
  decimals: number;
  programId: string;
};

export type PayPhase = "waiting" | "paid" | "burning" | "done";
