import { createBurnCheckedInstruction, getAccount, getMint } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { parseAmountRaw } from "../pay/amount";
import type { InvoicePaid } from "../pay/types";
import { findPayments, readBurn, tokenProgramOf, treasuryAta } from "../pay/watch";
import { envTrim, solanaRpc } from "./env";
import { getStore, type StoredInvoice } from "./store";

const SIG_PAGE = 100;

function connection(): Connection {
  return new Connection(solanaRpc(), "confirmed");
}

function keypairFromSecret(raw: string): Keypair {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    const bytes = Uint8Array.from(parsed.map((n) => Number(n)));
    return Keypair.fromSecretKey(bytes);
  }
  const bytes = Buffer.from(trimmed, "base64");
  return Keypair.fromSecretKey(bytes);
}

/** Treasury owner signer for burns. Secret is never sent to the browser. */
function treasuryOwner(expectedPubkey: string): Keypair {
  const raw = envTrim("TREASURY_SECRET") || envTrim("RECEIVE_SECRET") || envTrim("FEE_PAYER_SECRET");
  if (!raw) {
    throw new Error("Set TREASURY_SECRET or FEE_PAYER_SECRET on the server.");
  }
  let kp: Keypair;
  try {
    kp = keypairFromSecret(raw);
  } catch {
    throw new Error("Treasury signer is not a valid secret.");
  }
  if (kp.publicKey.toBase58() !== expectedPubkey) {
    throw new Error("Treasury signer does not match VITE_TREASURY_ADDRESS.");
  }
  return kp;
}

function feePayer(owner: Keypair): Keypair {
  const raw = envTrim("FEE_PAYER_SECRET");
  if (!raw) return owner;
  try {
    return keypairFromSecret(raw);
  } catch {
    return owner;
  }
}

function asPaid(invoice: StoredInvoice): InvoicePaid | null {
  if (!invoice.txSig || !invoice.burnSignature || !invoice.payer || !invoice.paidAt) {
    return null;
  }
  return {
    type: "invoice.paid",
    invoiceId: invoice.invoiceId,
    orderId: invoice.orderId,
    txSig: invoice.txSig,
    paidAt: invoice.paidAt,
    payer: invoice.payer,
    amountTokens: invoice.amountTokens,
    mint: invoice.mint,
    burnSignature: invoice.burnSignature,
    slot: invoice.slot ?? 0,
  };
}

async function unusedBurnSignature(
  conn: Connection,
  ata: PublicKey,
  mint: string,
  rawAmount: bigint,
  usedBurns: Set<string>,
): Promise<string | null> {
  const sigs = await conn.getSignaturesForAddress(ata, { limit: SIG_PAGE });
  for (const info of sigs) {
    if (info.err || usedBurns.has(info.signature)) continue;
    const tx = await conn.getParsedTransaction(info.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;
    if (readBurn(tx, mint, ata.toBase58(), rawAmount)) return info.signature;
  }
  return null;
}

async function sendBurn(params: {
  conn: Connection;
  ata: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  rawAmount: bigint;
  decimals: number;
  programId: PublicKey;
  treasury: string;
}): Promise<string> {
  const ownerKey = treasuryOwner(params.treasury);
  const relayer = feePayer(ownerKey);
  const burnIx = createBurnCheckedInstruction(
    params.ata,
    params.mint,
    params.owner,
    params.rawAmount,
    params.decimals,
    [],
    params.programId,
  );
  const { blockhash, lastValidBlockHeight } = await params.conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: relayer.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(burnIx);
  tx.sign(ownerKey);
  if (!relayer.publicKey.equals(ownerKey.publicKey)) tx.partialSign(relayer);
  const burnSignature = await params.conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });
  await params.conn.confirmTransaction({
    signature: burnSignature,
    blockhash,
    lastValidBlockHeight,
  });
  return burnSignature;
}

export async function settleInvoice(invoice: StoredInvoice): Promise<InvoicePaid | null> {
  const already = asPaid(invoice);
  if (already) return already;

  const conn = connection();
  const mint = new PublicKey(invoice.mint);
  const owner = new PublicKey(invoice.receivePubkey);
  const programId = await tokenProgramOf(conn, mint);
  const ata = await treasuryAta(conn, invoice.receivePubkey, invoice.mint);
  const mintInfo = await getMint(conn, mint, "confirmed", programId);
  const rawAmount =
    parseAmountRaw(invoice.amountRaw) ??
    BigInt(Math.round(invoice.amountTokens * 10 ** mintInfo.decimals));

  const store = await getStore();
  const listed = await store.listInvoices();
  const byId = new Map(listed.map((row) => [row.invoiceId, row]));
  const current = byId.get(invoice.invoiceId);
  const merged: StoredInvoice = current ? { ...invoice, ...current } : invoice;
  byId.set(merged.invoiceId, merged);

  const usedTx = new Set<string>();
  const usedBurns = new Set<string>();
  for (const row of byId.values()) {
    if (row.txSig) usedTx.add(row.txSig);
    if (row.burnSignature) usedBurns.add(row.burnSignature);
  }

  let txSig = merged.txSig ?? "";
  let payer = merged.payer ?? "";
  let slot = merged.slot ?? 0;

  if (!txSig) {
    const matches = await findPayments({
      treasury: invoice.receivePubkey,
      mint: invoice.mint,
      amountRaw: rawAmount,
      createdAt: merged.createdAt,
      rpc: solanaRpc(),
    });
    const unmatched = matches.filter((row) => !usedTx.has(row.signature));
    const sameAmount = [...byId.values()]
      .filter((row) => !row.txSig && row.amountRaw === merged.amountRaw)
      .sort((a, b) => a.createdAt - b.createdAt || a.invoiceId.localeCompare(b.invoiceId));
    const index = sameAmount.findIndex((row) => row.invoiceId === merged.invoiceId);
    const hit = unmatched[index < 0 ? 0 : index];
    if (!hit) return null;
    if ([...byId.values()].some((row) => row.txSig === hit.signature)) return null;
    txSig = hit.signature;
    payer = hit.payer;
    slot = hit.slot;
    await store.putInvoice({ ...merged, txSig, payer, slot });
  }

  if (merged.burnSignature) {
    return asPaid({ ...merged, txSig, payer, slot });
  }

  let accountAmount = 0n;
  try {
    const account = await getAccount(conn, ata, "confirmed", programId);
    accountAmount = account.amount;
  } catch {
    accountAmount = 0n;
  }

  let burnSignature: string | null = null;
  if (accountAmount >= rawAmount) {
    burnSignature = await sendBurn({
      conn,
      ata,
      mint,
      owner,
      rawAmount,
      decimals: mintInfo.decimals,
      programId,
      treasury: invoice.receivePubkey,
    });
  } else {
    burnSignature = await unusedBurnSignature(conn, ata, invoice.mint, rawAmount, usedBurns);
  }
  if (!burnSignature) return null;

  const paidAt = new Date().toISOString();
  return {
    type: "invoice.paid",
    invoiceId: invoice.invoiceId,
    orderId: invoice.orderId,
    txSig,
    paidAt,
    payer,
    amountTokens: invoice.amountTokens,
    mint: invoice.mint,
    burnSignature,
    slot,
  };
}
