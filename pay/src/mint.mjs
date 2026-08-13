import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export const MINT = "CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump";
export const AMOUNT_TOKENS = 100000;
export const amountRaw = 100000000000n;
export const DECIMALS = 6;
export const TOKEN_2022 = TOKEN_2022_PROGRAM_ID;

export async function loadMint(connection) {
  const mintPk = new PublicKey(MINT);
  const info = await connection.getAccountInfo(mintPk, "finalized");
  if (!info) throw new Error("mint account missing");
  const programId = info.owner;
  if (!programId.equals(TOKEN_2022_PROGRAM_ID) && !programId.equals(TOKEN_PROGRAM_ID)) {
    throw new Error("mint owner is not a token program");
  }
  const mint = await getMint(connection, mintPk, "finalized", programId);
  if (mint.decimals !== DECIMALS) throw new Error("expected 6 decimals");
  return { mintPk, mint, programId };
}

export function ataFor(owner, mint, programId) {
  const ownerPk = owner instanceof PublicKey ? owner : new PublicKey(owner);
  const mintPk = mint instanceof PublicKey ? mint : new PublicKey(mint);
  return getAssociatedTokenAddressSync(
    mintPk,
    ownerPk,
    false,
    programId
  );
}
