import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_DECIMALS } from "../pay/amount";
import { amountRaw, receivePubkey, solanaRpc, tokenMint } from "./config";
import { signAndSend, walletPublicKey } from "./wallet";

type PrefetchedPay = {
  payer: string;
  mint: PublicKey;
  dest: PublicKey;
  srcAta: PublicKey;
  destAta: PublicKey;
  programId: PublicKey;
};

let prefetch: PrefetchedPay | null = null;

function rpc(): Connection {
  return new Connection(solanaRpc(), "processed");
}

function requireMint(): PublicKey {
  const mint = tokenMint();
  if (!mint) {
    throw new Error("Payment mint is not configured.");
  }
  return new PublicKey(mint);
}

async function loadPayAccounts(payer: PublicKey): Promise<PrefetchedPay> {
  const mint = requireMint();
  const dest = new PublicKey(receivePubkey());
  const programId = TOKEN_2022_PROGRAM_ID;
  const srcAta = await getAssociatedTokenAddress(mint, payer, false, programId);
  const destAta = await getAssociatedTokenAddress(mint, dest, false, programId);
  return { payer: payer.toBase58(), mint, dest, srcAta, destAta, programId };
}

function transferIx(ready: PrefetchedPay, payer: PublicKey): Transaction {
  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ready.destAta,
      ready.dest,
      ready.mint,
      ready.programId,
    ),
    createTransferCheckedInstruction(
      ready.srcAta,
      ready.mint,
      ready.destAta,
      payer,
      amountRaw(),
      TOKEN_DECIMALS,
      [],
      ready.programId,
    ),
  );
  tx.feePayer = payer;
  return tx;
}

/** Dest ATA + transfer ix after connect. Never cache a blockhash. */
export async function prefetchPayTransfer(): Promise<void> {
  try {
    const payer = walletPublicKey();
    const ready = await loadPayAccounts(payer);
    prefetch = ready;
    const connection = rpc();
    void connection.getAccountInfo(ready.destAta, "processed").catch(() => undefined);
    void connection.getLatestBlockhash("processed").then(() => undefined).catch(() => undefined);
  } catch {
    prefetch = null;
  }
}

export function clearPayPrefetch(): void {
  prefetch = null;
}

/** Exactly 100,000 $POST to the treasury. Pay path: fresh blockhash + sign. */
export async function payFixedPost(): Promise<{ signature: string }> {
  const payer = walletPublicKey();
  const ready =
    prefetch && prefetch.payer === payer.toBase58() ? prefetch : await loadPayAccounts(payer);
  if (!prefetch || prefetch.payer !== payer.toBase58()) prefetch = ready;

  const tx = transferIx(ready, payer);
  const { blockhash } = await rpc().getLatestBlockhash("processed");
  tx.recentBlockhash = blockhash;
  const signature = await signAndSend(tx);
  return { signature };
}

/** Optional background status. Never block Pay on confirmed/finalized. */
export function watchPaySignature(signature: string): void {
  void rpc()
    .getSignatureStatus(signature)
    .catch(() => undefined);
}
