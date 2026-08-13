import {
  DEFAULT_SOLANA_RPC,
  DEFAULT_TOKEN_AMOUNT,
  DEFAULT_TOKEN_MINT,
} from "../pay";

export const X_URL = "https://x.com/OpenXPost";
export const X_HANDLE = "@OpenXPost";

export function tokenMint(): string {
  const fromEnv = import.meta.env.VITE_TOKEN_MINT?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_TOKEN_MINT;
}

export function tokenAmount(): number {
  const raw = import.meta.env.VITE_TOKEN_AMOUNT?.trim();
  if (!raw) return DEFAULT_TOKEN_AMOUNT;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TOKEN_AMOUNT;
}

export function solanaRpc(): string {
  const fromEnv = import.meta.env.VITE_SOLANA_RPC?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SOLANA_RPC;
}

export function payApi(): string | null {
  const fromEnv = import.meta.env.VITE_PAY_API?.trim();
  if (!fromEnv) return null;
  return fromEnv.replace(/\/$/, "");
}
