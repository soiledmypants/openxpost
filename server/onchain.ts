import {
  createBurnCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import type { InvoicePaid } from "../pay/types";
import { envTrim, solanaRpc } from "./env";
import { getStore, type StoredInvoice } from "./store";

const SIG_PAGE = 100;
const SIG_PAGES = 5;

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

/** Owner signer for burns. Secret is never logged. */
function receiveOwner(expectedPubkey: string): Keypair {
  const raw = envTrim("RECEIVE_SECRET") || envTrim("FEE_PAYER_SECRET");
  if (!raw) {
    throw new Error("Set RECEIVE_SECRET or FEE_PAYER_SECRET on the server.");
  }
  let kp: Keypair;
  try {
    kp = keypairFromSecret(raw);
  } catch {
    throw new Error("Receive signer is not a valid secret.");
  }
  if (kp.publicKey.toBase58() !== expectedPubkey) {
    throw new Error("Receive signer does not match the receive wallet.");
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

async function tokenProgramOf(conn: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await conn.getAccountInfo(mint);
  if (info?.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

function collectParsed(tx: ParsedTransactionWithMeta): ParsedInstruction[] {
  const top = tx.transaction.message.instructions.filter(
    (ix): ix is ParsedInstruction => "parsed" in ix,
  );
  const inner =
    tx.meta?.innerInstructions?.flatMap((group) =>
      group.instructions.filter((ix): ix is ParsedInstruction => "parsed" in ix),
    ) ?? [];
  return [...top, ...inner];
}

function isSplTokenParsed(ix: ParsedInstruction): boolean {
  const program = typeof ix.program === "string" ? ix.program : "";
  if (!program) return true;
  return program === "spl-token" || program === "spl-token-2022";
}

function parsedAmount(info: Record<string, unknown>): bigint {
  const tokenAmount = info.tokenAmount as { amount?: string } | undefined;
  return BigInt(String(tokenAmount?.amount ?? info.amount ?? "0"));
}

function parsedPayer(info: Record<string, unknown>): string {
  const authority = String(info.authority ?? "").trim();
  const multisig = String(info.multisigAuthority ?? "").trim();
  return authority || multisig;
}

function readTransfer(
  tx: ParsedTransactionWithMeta,
  mint: string,
  destAta: string,
  rawAmount: bigint,
): { payer: string } | null {
  for (const ix of collectParsed(tx)) {
    if (!isSplTokenParsed(ix)) continue;
    const parsed = ix.parsed;
    if (!parsed || typeof parsed !== "object") continue;
    const type = (parsed as { type?: string }).type;
    if (type !== "transfer" && type !== "transferChecked") continue;
    const info = (parsed as { info?: Record<string, unknown> }).info;
    if (!info) continue;
    const destination = String(info.destination ?? "");
    const mintIx = String(info.mint ?? mint);
    const amount = parsedAmount(info);
    const payer = parsedPayer(info);
    if (destination === destAta && mintIx === mint && amount === rawAmount && payer) {
      return { payer };
    }
  }
  return null;
}

function readBurn(
  tx: ParsedTransactionWithMeta,
  mint: string,
  ata: string,
  rawAmount: bigint,
): boolean {
  for (const ix of collectParsed(tx)) {
    if (!isSplTokenParsed(ix)) continue;
    const parsed = ix.parsed;
    if (!parsed || typeof parsed !== "object") continue;
    const type = (parsed as { type?: string }).type;
    if (type !== "burn" && type !== "burnChecked") continue;
    const info = (parsed as { info?: Record<string, unknown> }).info;
    if (!info) continue;
    const account = String(info.account ?? info.source ?? "");
    const mintIx = String(info.mint ?? mint);
    const amount = parsedAmount(info);
    if (account === ata && mintIx === mint && amount === rawAmount) return true;
  }
  return false;
}

type MatchedTransfer = {
  txSig: string;
  payer: string;
  slot: number;
};

async function matchingTransfers(
  conn: Connection,
  ata: PublicKey,
  mint: string,
  rawAmount: bigint,
): Promise<MatchedTransfer[]> {
  const found: MatchedTransfer[] = [];
  let before: string | undefined;
  for (let page = 0; page < SIG_PAGES; page += 1) {
    const sigs = await conn.getSignaturesForAddress(ata, {
      limit: SIG_PAGE,
      ...(before ? { before } : {}),
    });
    if (sigs.length === 0) break;
    for (const info of sigs) {
      if (info.err) continue;
      const tx = await conn.getParsedTransaction(info.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) continue;
      const hit = readTransfer(tx, mint, ata.toBase58(), rawAmount);
      if (!hit) continue;
      found.push({ txSig: info.signature, payer: hit.payer, slot: tx.slot });
    }
    const last = sigs[sigs.length - 1];
    if (!last || sigs.length < SIG_PAGE) break;
    before = last.signature;
  }
  found.reverse();
  return found;
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
  receivePubkey: string;
}): Promise<string> {
  const ownerKey = receiveOwner(params.receivePubkey);
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
  const ata = await getAssociatedTokenAddress(mint, owner, false, programId);
  const mintInfo = await getMint(conn, mint, "confirmed", programId);
  const rawAmount = BigInt(invoice.amountTokens) * 10n ** BigInt(mintInfo.decimals);

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
    const open = [...byId.values()]
      .filter((row) => !row.txSig)
      .sort((a, b) => a.createdAt - b.createdAt || a.invoiceId.localeCompare(b.invoiceId));
    const index = open.findIndex((row) => row.invoiceId === merged.invoiceId);
    if (index < 0) return null;

    const matches = await matchingTransfers(conn, ata, invoice.mint, rawAmount);
    const unmatched = matches.filter((row) => !usedTx.has(row.txSig));
    const hit = unmatched[index];
    if (!hit) return null;

    if ([...byId.values()].some((row) => row.txSig === hit.txSig)) return null;
    txSig = hit.txSig;
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
      receivePubkey: invoice.receivePubkey,
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
