export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const TREASURY_NOT_SET = "TREASURY_NOT_SET";
export const TARGET_USD = 1;
export const QUOTE_TTL_MS = 15 * 60 * 1000;
export const SUFFIX_MIN = 1;
export const SUFFIX_MAX = 9999;

export type Quote = {
  /** Exact native transfer, as integer lamports. */
  lamports: bigint;
  /** Always 9 decimal places. Copy this string — do not round. */
  amountSol: string;
  suffix: number;
  treasury: string;
  createdAt: number;
  expiresAt: number;
  targetUsd: number;
  solPriceUsd: number;
};

export type PaymentHit = {
  signature: string;
  slot: number;
  lamports: bigint;
};
