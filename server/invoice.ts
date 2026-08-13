import { allocateAmountRaw, formatAmountUi, parseAmountRaw, RESERVE_GRACE_MS } from "../pay/amount";
import { postTextHash } from "../pay/hash";
import type { CreateInvoiceInput, InvoiceCreated, InvoicePaid } from "../pay/types";
import { checkDraft } from "../src/lib/rules";
import { amountTokens as baseAmountTokens, requireTreasury, tokenMint } from "./env";
import { settleInvoice } from "./onchain";
import { getStore, type StoredInvoice } from "./store";

function publicInvoice(record: StoredInvoice): InvoiceCreated {
  const amountRaw = parseAmountRaw(record.amountRaw) ?? 0n;
  const amountUi = record.amountUi || (amountRaw > 0n ? formatAmountUi(amountRaw) : "0.000000");
  return {
    invoiceId: record.invoiceId,
    receivePubkey: record.receivePubkey,
    mint: record.mint,
    amountTokens: record.amountTokens,
    amountUi,
    amountRaw: amountRaw > 0n ? amountRaw.toString() : record.amountRaw,
  };
}

function paidFromRecord(record: StoredInvoice): InvoicePaid | null {
  if (!record.txSig || !record.burnSignature || !record.payer || !record.paidAt) {
    return null;
  }
  return {
    type: "invoice.paid",
    invoiceId: record.invoiceId,
    orderId: record.orderId,
    txSig: record.txSig,
    paidAt: record.paidAt,
    payer: record.payer,
    amountTokens: record.amountTokens,
    mint: record.mint,
    burnSignature: record.burnSignature,
    slot: record.slot ?? 0,
  };
}

function reservedAmountRaws(invoices: StoredInvoice[], now: number): Set<string> {
  const reserved = new Set<string>();
  for (const row of invoices) {
    const raw = row.amountRaw?.trim();
    if (!raw) continue;
    if (!row.txSig) {
      reserved.add(raw);
      continue;
    }
    const paidAtMs = row.paidAt ? Date.parse(row.paidAt) : Number.NaN;
    const anchor = Number.isFinite(paidAtMs) ? paidAtMs : row.createdAt;
    if (now - anchor < RESERVE_GRACE_MS) reserved.add(raw);
  }
  return reserved;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceCreated> {
  const postText = input.postText.trim();
  const hits = checkDraft(postText);
  if (hits.length > 0) {
    throw new Error(hits.map((hit) => hit.message).join(" "));
  }
  const expectedHash = await postTextHash(postText);
  if (input.postTextHash && input.postTextHash !== expectedHash) {
    throw new Error("postTextHash does not match postText.");
  }
  if (!input.orderId.trim()) {
    throw new Error("orderId is required.");
  }

  const treasury = requireTreasury();
  const store = await getStore();
  const allocated = allocateAmountRaw(reservedAmountRaws(await store.listInvoices(), Date.now()), baseAmountTokens());

  const record: StoredInvoice = {
    invoiceId: crypto.randomUUID(),
    orderId: input.orderId.trim(),
    postText,
    postTextHash: expectedHash,
    receivePubkey: treasury,
    mint: tokenMint(),
    amountTokens: baseAmountTokens(),
    amountUi: allocated.amountUi,
    amountRaw: allocated.amountRaw.toString(),
    createdAt: Date.now(),
  };
  await store.putInvoice(record);
  return publicInvoice(record);
}

export async function loadInvoice(invoiceId: string): Promise<StoredInvoice | null> {
  return (await getStore()).getInvoice(invoiceId);
}

export async function invoiceStatus(invoiceId: string): Promise<{
  invoice: InvoiceCreated;
  paid: InvoicePaid | null;
} | null> {
  const store = await getStore();
  let record = await store.getInvoice(invoiceId);
  if (!record) return null;

  let paid = paidFromRecord(record);
  if (!paid) {
    paid = await settleInvoice(record);
    if (paid) {
      record = {
        ...record,
        txSig: paid.txSig,
        payer: paid.payer,
        burnSignature: paid.burnSignature,
        slot: paid.slot,
        paidAt: paid.paidAt,
      };
      await store.putInvoice(record);
    }
  }

  return { invoice: publicInvoice(record), paid };
}
