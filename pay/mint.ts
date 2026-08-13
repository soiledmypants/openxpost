import {
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import type { MintMeta } from "./types";

export function tokensToRaw(amountTokens: number, decimals: number): bigint {
  if (!Number.isInteger(amountTokens) || amountTokens <= 0) {
    throw new Error("amountTokens must be a positive integer");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("mint decimals out of range");
  }
  // Test mint: 6 decimals → 100_000 whole tokens = 100_000_000_000 raw.
  return BigInt(amountTokens) * 10n ** BigInt(decimals);
}

export async function fetchMintMeta(rpc: string, mint: string): Promise<MintMeta> {
  const connection = new Connection(rpc, "confirmed");
  const mintPk = new PublicKey(mint);
  const info = await connection.getAccountInfo(mintPk, "confirmed");
  if (!info) {
    throw new Error("mint account not found");
  }
  const programId = info.owner;
  const supported =
    programId.equals(TOKEN_PROGRAM_ID) || programId.equals(TOKEN_2022_PROGRAM_ID);
  if (!supported) {
    throw new Error("mint is not SPL Token or Token-2022");
  }
  const parsed = await getMint(connection, mintPk, "confirmed", programId);
  return {
    mint: mintPk.toBase58(),
    decimals: parsed.decimals,
    programId: programId.toBase58(),
  };
}

export function associatedTokenAddress(
  mint: string,
  owner: string,
  programId: string,
): string {
  return getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(owner),
    false,
    new PublicKey(programId),
  ).toBase58();
}
