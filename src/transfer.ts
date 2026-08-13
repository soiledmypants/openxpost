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

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
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
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  const signature = await signAndSend(tx);
  return { signature, blockhash, lastValidBlockHeight };
}

export async function confirmPaySignature(params: {
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
}): Promise<void> {
  const connection = new Connection(solanaRpc(), "confirmed");
  await connection.confirmTransaction(
    {
      signature: params.signature,
      blockhash: params.blockhash,
      lastValidBlockHeight: params.lastValidBlockHeight,
    },
    "confirmed",
  );
}
