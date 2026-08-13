import {
  DEFAULT_AMOUNT_TOKENS,
  DEFAULT_RECEIVE_PUBKEY,
  DEFAULT_SOLANA_RPC,
  DEFAULT_TOKEN_MINT,
} from "../pay/types";

export function envTrim(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function tokenMint(): string {
  return envTrim("TOKEN_MINT") || envTrim("VITE_TOKEN_MINT") || DEFAULT_TOKEN_MINT;
}

export function amountTokens(): number {
  const raw = envTrim("TOKEN_AMOUNT") || envTrim("VITE_TOKEN_AMOUNT");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_AMOUNT_TOKENS;
}

function heliusRpc(): string {
  const raw = envTrim("HELIUS_API_KEY") || envTrim("HELIUS_RPC_URL");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(raw)}`;
}

export function solanaRpc(): string {
  return heliusRpc() || envTrim("SOLANA_RPC") || envTrim("VITE_SOLANA_RPC") || DEFAULT_SOLANA_RPC;
}

export function receivePubkey(): string {
  return envTrim("RECEIVE_PUBKEY") || DEFAULT_RECEIVE_PUBKEY;
}

export function requireXAuth(): {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
} {
  const clientId = envTrim("X_CLIENT_ID");
  const clientSecret = envTrim("X_CLIENT_SECRET");
  const accessToken = envTrim("X_ACCESS_TOKEN");
  const refreshToken = envTrim("X_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !accessToken || !refreshToken) {
    throw new Error(
      "X posting is not configured. Set X_CLIENT_ID, X_CLIENT_SECRET, X_ACCESS_TOKEN, and X_REFRESH_TOKEN on the server.",
    );
  }
  return { clientId, clientSecret, accessToken, refreshToken };
}
