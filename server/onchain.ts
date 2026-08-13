import {
  getAssociatedTokenAddress,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import type { InvoicePaid } from "../pay/types";
import { MATCH_SKEW_MS, MATCH_WINDOW_MS, parseAmountRaw } from "../pay/amount";
import { solanaRpc } from "./env";
import { getStore, type StoredInvoice } from "./store";

const SIG_PAGE = 100;
const SIG_PAGES = 5;

function connection(): Connection {
  return new Connection(solanaRpc(), "confirmed");
}

function asPaid(invoice: StoredInvoice): InvoicePaid | null {
  if (!invoice.txSig || !invoice.payer || !invoice.paidAt) {
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
    if (type !== "transferChecked" && type !== "transfer") continue;
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

type MatchedTransfer = {
  txSig: string;
  payer: string;
  slot: number;
  blockTimeMs: number;
};

function inMatchWindow(blockTimeMs: number, createdAt: number, now: number): boolean {
  const start = createdAt - MATCH_SKEW_MS;
  const end = Math.min(now, createdAt + MATCH_WINDOW_MS);
  return blockTimeMs >= start && blockTimeMs <= end;
}

async function matchingTransfers(
  conn: Connection,
  ata: PublicKey,
  mint: string,
  rawAmount: bigint,
  createdAt: number,
  now: number,
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
      const blockTimeMs = (info.blockTime ?? 0) * 1000;
      if (blockTimeMs && !inMatchWindow(blockTimeMs, createdAt, now)) continue;
      const tx = await conn.getParsedTransaction(info.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) continue;
      const hit = readTransfer(tx, mint, ata.toBase58(), rawAmount);
      if (!hit) continue;
      found.push({
        txSig: info.signature,
        payer: hit.payer,
        slot: tx.slot,
        blockTimeMs: blockTimeMs || (tx.blockTime ? tx.blockTime * 1000 : createdAt),
      });
    }
    const last = sigs[sigs.length - 1];
    if (!last || sigs.length < SIG_PAGE) break;
    before = last.signature;
  }
  found.reverse();
  return found;
}

/** Paid when the exact 100,000 $POST transfer is in the treasury. Do not burn. */
export async function settleInvoice(invoice: StoredInvoice): Promise<InvoicePaid | null> {
  const already = asPaid(invoice);
  if (already) return already;

  const conn = connection();
  const mint = new PublicKey(invoice.mint);
  const owner = new PublicKey(invoice.receivePubkey);
  const programId = await tokenProgramOf(conn, mint);
  const ata = await getAssociatedTokenAddress(mint, owner, false, programId);
  const mintInfo = await getMint(conn, mint, "confirmed", programId);
  const rawAmount =
    parseAmountRaw(invoice.amountRaw ?? "") ??
    BigInt(Math.round(invoice.amountTokens * 10 ** mintInfo.decimals));

  const store = await getStore();
  const listed = await store.listInvoices();
  const byId = new Map(listed.map((row) => [row.invoiceId, row]));
  const current = byId.get(invoice.invoiceId);
  const merged: StoredInvoice = current ? { ...invoice, ...current } : invoice;
  byId.set(merged.invoiceId, merged);

  const usedTx = new Set<string>();
  for (const row of byId.values()) {
    if (row.txSig) usedTx.add(row.txSig);
  }

  let txSig = merged.txSig ?? "";
  let payer = merged.payer ?? "";
  let slot = merged.slot ?? 0;

  if (!txSig) {
    const now = Date.now();
    const matches = await matchingTransfers(
      conn,
      ata,
      invoice.mint,
      rawAmount,
      merged.createdAt,
      now,
    );
    const unmatched = matches.filter((row) => {
      if (usedTx.has(row.txSig)) return false;
      if (merged.fromPubkey && row.payer !== merged.fromPubkey) return false;
      return true;
    });
    const sameWallet = [...byId.values()]
      .filter((row) => {
        if (row.txSig) return false;
        if (merged.fromPubkey) return (row.fromPubkey ?? "") === merged.fromPubkey;
        return (row.amountRaw ?? "") === (merged.amountRaw ?? "");
      })
      .sort((a, b) => a.createdAt - b.createdAt || a.invoiceId.localeCompare(b.invoiceId));
    const index = sameWallet.findIndex((row) => row.invoiceId === merged.invoiceId);
    const hit = unmatched[index < 0 ? 0 : index];
    if (!hit) return null;
    if ([...byId.values()].some((row) => row.txSig === hit.txSig)) return null;
    txSig = hit.txSig;
    payer = hit.payer;
    slot = hit.slot;
    await store.putInvoice({ ...merged, txSig, payer, slot });
  }

  const paidAt = merged.paidAt ?? new Date().toISOString();
  return {
    type: "invoice.paid",
    invoiceId: invoice.invoiceId,
    orderId: invoice.orderId,
    txSig,
    paidAt,
    payer,
    amountTokens: invoice.amountTokens,
    mint: invoice.mint,
    slot,
  };
}
