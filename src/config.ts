import { DEFAULT_SOLANA_RPC, TREASURY_NOT_SET } from "../pay";

export function treasuryAddress(): string {
  const fromEnv = import.meta.env.VITE_TREASURY_ADDRESS?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : TREASURY_NOT_SET;
}

export function solanaRpc(): string {
  const fromEnv = import.meta.env.VITE_SOLANA_RPC?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SOLANA_RPC;
}
