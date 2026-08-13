import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
import { PublicKey, Transaction, type Connection } from "@solana/web3.js";
import { tokensToRaw } from "./mint";
import type { Invoice, MintMeta } from "./types";

export async function buildExactTokenTransfer(input: {
  connection: Connection;
  from: PublicKey;
  invoice: Invoice;
  mintMeta: MintMeta;
}): Promise<Transaction> {
  const mint = new PublicKey(input.invoice.mint);
  const programId = new PublicKey(input.mintMeta.programId);
  const destOwner = new PublicKey(input.invoice.receivePubkey);
  const amountRaw = tokensToRaw(input.invoice.amountTokens, input.mintMeta.decimals);

  const fromAta = getAssociatedTokenAddressSync(mint, input.from, false, programId);
  const toAta = getAssociatedTokenAddressSync(mint, destOwner, false, programId);

  try {
    const account = await getAccount(input.connection, fromAta, "confirmed", programId);
    if (account.amount < amountRaw) {
      throw new Error("Connected wallet does not hold 10,000 tokens of this mint.");
    }
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError || err instanceof TokenInvalidAccountOwnerError) {
      throw new Error("Connected wallet has no token account for this mint.");
    }
    throw err;
  }

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      input.from,
      toAta,
      destOwner,
      mint,
      programId,
    ),
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      input.from,
      amountRaw,
      input.mintMeta.decimals,
      [],
      programId,
    ),
  );
  tx.feePayer = input.from;
  const latest = await input.connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  return tx;
}
