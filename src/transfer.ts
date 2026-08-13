import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { BASE_AMOUNT_RAW, TOKEN_DECIMALS } from "../pay/amount";
import { receivePubkey, solanaRpc, tokenMint } from "./config";
import { signAndSend, walletPublicKey } from "./wallet";

function isBlockHeightExceeded(error: unknown): boolean {
  if (error && typeof error === "object" && "name" in error) {
    const name = String((error as { name?: string }).name ?? "");
    if (name === "TransactionExpiredBlockheightExceededError") return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /block height exceeded|has expired/i.test(message);
}

async function signatureLanded(connection: Connection, signature: string): Promise<boolean> {
  const status = await connection.getSignatureStatus(signature, {
    searchTransactionHistory: true,
  });
  if (status.value) return !status.value.err;
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  return Boolean(tx && !tx.meta?.err);
}

/** Exactly 100,000 $POST (6 decimals, Token-2022) to the treasury. */
export async function payFixedPost(): Promise<{
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  const connection = new Connection(solanaRpc(), "confirmed");
  const payer = walletPublicKey();
  const mint = new PublicKey(tokenMint());
  const dest = new PublicKey(receivePubkey());
  const programId = TOKEN_2022_PROGRAM_ID;
  const srcAta = await getAssociatedTokenAddress(mint, payer, false, programId);
  const destAta = await getAssociatedTokenAddress(mint, dest, false, programId);

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(payer, destAta, dest, mint, programId),
    createTransferCheckedInstruction(
      srcAta,
      mint,
      destAta,
      payer,
      BASE_AMOUNT_RAW,
      TOKEN_DECIMALS,
      [],
      programId,
    ),
  );
  tx.feePayer = payer;

  // Fresh hash immediately before sign+send. Never reuse a connect-time prefetch.
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  const signature = await signAndSend(tx);
  return { signature, blockhash, lastValidBlockHeight };
}

export async function confirmPaySignature(params: {
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
}): Promise<void> {
  const connection = new Connection(solanaRpc(), "confirmed");
  try {
    await connection.confirmTransaction(
      {
        signature: params.signature,
        blockhash: params.blockhash,
        lastValidBlockHeight: params.lastValidBlockHeight,
      },
      "confirmed",
    );
  } catch (error) {
    if (!isBlockHeightExceeded(error)) throw error;
    const status = await connection.getSignatureStatus(params.signature, {
      searchTransactionHistory: true,
    });
    if (status.value?.err) throw error;
    if (status.value) return;
    if (await signatureLanded(connection, params.signature)) return;
    // Send already returned this signature; don't fail the UI on confirm expiry.
  }
}
