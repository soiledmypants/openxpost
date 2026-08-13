import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import type { InvoiceCreated } from "../pay/types";
import { solanaRpc } from "./config";
import { signAndSend, walletPublicKey } from "./wallet";

async function tokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (info?.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

/** User-signed transfer of exactly invoice.amountRaw to receivePubkey. Unused by the unique-send pay path. */
export async function payInvoice(invoice: InvoiceCreated): Promise<string> {
  const connection = new Connection(solanaRpc(), "confirmed");
  const payer = walletPublicKey();
  const mint = new PublicKey(invoice.mint);
  const dest = new PublicKey(invoice.receivePubkey);
  const programId = await tokenProgram(connection, mint);
  const mintInfo = await getMint(connection, mint, "confirmed", programId);
  const raw = BigInt(invoice.amountRaw);
  const srcAta = await getAssociatedTokenAddress(mint, payer, false, programId);
  const destAta = await getAssociatedTokenAddress(mint, dest, false, programId);

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      destAta,
      dest,
      mint,
      programId,
    ),
    createTransferCheckedInstruction(
      srcAta,
      mint,
      destAta,
      payer,
      raw,
      mintInfo.decimals,
      [],
      programId,
    ),
  );
  tx.feePayer = payer;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  return signAndSend(tx);
}
