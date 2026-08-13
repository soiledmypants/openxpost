import { amountRawFromTokens } from "../pay/amount";
import {
  DEFAULT_AMOUNT_TOKENS,
  DEFAULT_RECEIVE_PUBKEY,
  DEFAULT_SOLANA_RPC,
  DEFAULT_TOKEN_MINT,
  TOKEN_TICKER,
} from "../pay/types";

export { TOKEN_TICKER };

function envTrim(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Quiet CA slot and payment mint. Same value as TOKEN_MINT on the server. Empty = unset. */
export function tokenMint(): string {
  return envTrim(import.meta.env.VITE_TOKEN_MINT) || DEFAULT_TOKEN_MINT;
}

/** Copyable Pay address / treasury. Same value as TREASURY_ADDRESS on the server. */
export function receivePubkey(): string {
  return envTrim(import.meta.env.VITE_TREASURY_ADDRESS) || DEFAULT_RECEIVE_PUBKEY;
}

export function amountTokens(): number {
  const n = Number(envTrim(import.meta.env.VITE_TOKEN_AMOUNT));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_AMOUNT_TOKENS;
}

export function amountRaw(): bigint {
  return amountRawFromTokens(amountTokens());
}

export function solanaRpc(): string {
  const fromEnv = import.meta.env.VITE_SOLANA_RPC?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/rpc`;
  }
  return DEFAULT_SOLANA_RPC;
}

export function shortenMint(mint: string): string {
  if (mint.length <= 12) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}
