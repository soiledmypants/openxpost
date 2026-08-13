import {
  DEFAULT_AMOUNT_TOKENS,
  DEFAULT_SOLANA_RPC,
  DEFAULT_TOKEN_MINT,
  isTreasuryConfigured,
  TOKEN_TICKER,
  TREASURY_NOT_SET,
} from "../pay/types";

export { TOKEN_TICKER, TREASURY_NOT_SET };

export function tokenMint(): string {
  const fromEnv = import.meta.env.VITE_TOKEN_MINT?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_TOKEN_MINT;
}

export function amountTokens(): number {
  const raw = import.meta.env.VITE_TOKEN_AMOUNT?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_AMOUNT_TOKENS;
}

export function treasuryAddress(): string {
  const fromEnv = import.meta.env.VITE_TREASURY_ADDRESS?.trim() ?? "";
  return isTreasuryConfigured(fromEnv) ? fromEnv : TREASURY_NOT_SET;
}

export function solanaRpc(): string {
  const fromEnv = import.meta.env.VITE_SOLANA_RPC?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SOLANA_RPC;
}

export function shortenMint(mint: string): string {
  if (mint.length <= 12) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}
