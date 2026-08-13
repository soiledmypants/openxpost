import { BASE_AMOUNT_RAW } from "../pay/amount";
import { postTextHash } from "../pay/hash";
import type { CreateInvoiceInput, InvoiceCreated, InvoicePaid, PublicBoard } from "../pay/types";
import { checkDraft } from "../src/lib/rules";
import { amountTokens as baseAmountTokens, receivePubkey, tokenMint } from "./env";
import { getStore, type StoredInvoice } from "./store";

/** Create/store only. Do not import onchain, web3, spl-token, or wallet adapters. */

export function publicInvoice(record: StoredInvoice): InvoiceCreated {
  const amountRaw = record.amountRaw?.trim() || BASE_AMOUNT_RAW.toString();
  return {
    invoiceId: record.invoiceId,
    orderId: record.orderId,
    receivePubkey: record.receivePubkey,
    mint: record.mint,
    amountTokens: typeof record.amountTokens === "number" && record.amountTokens > 0
      ? record.amountTokens
      : baseAmountTokens(),
    amountRaw,
    fromPubkey: record.fromPubkey ?? record.expectedPayer ?? "",
  };
}

export function paidFromRecord(record: StoredInvoice): InvoicePaid | null {
  if (!record.txSig || !record.payer || !record.paidAt) {
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
    slot: record.slot ?? 0,
  };
}

export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceCreated> {
  const postText = input.postText.trim();
  const fromPubkey = input.fromPubkey.trim();
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
  if (!fromPubkey) {
    throw new Error("fromPubkey is required.");
  }

  const record: StoredInvoice = {
    invoiceId: crypto.randomUUID(),
    orderId: input.orderId.trim(),
    postText,
    postTextHash: expectedHash,
    fromPubkey,
    receivePubkey: receivePubkey(),
    mint: tokenMint(),
    amountTokens: baseAmountTokens(),
    amountRaw: BASE_AMOUNT_RAW.toString(),
    createdAt: Date.now(),
  };
  try {
    await (await getStore()).putInvoice(record);
  } catch {
    // Quote even if blob/file store is unavailable.
  }
  return publicInvoice(record);
}

export async function loadInvoice(invoiceId: string): Promise<StoredInvoice | null> {
  return (await getStore()).getInvoice(invoiceId);
}

export async function publicBoard(): Promise<PublicBoard> {
  let invoices: StoredInvoice[] = [];
  try {
    invoices = await (await getStore()).listInvoices();
  } catch {
    invoices = [];
  }
  const posted = invoices
    .filter((row) => Boolean(row.tweetUrl && row.txSig && row.paidAt))
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? "") || b.createdAt - a.createdAt)
    .map((row) => ({
      invoiceId: row.invoiceId,
      tweetUrl: row.tweetUrl ?? "",
      tweetText: row.postText ?? "",
      txSig: row.txSig ?? "",
      paidAt: row.paidAt ?? "",
    }))
    .filter((row) => row.tweetUrl && row.txSig);
  return {
    receivePubkey: receivePubkey(),
    mint: tokenMint(),
    amountTokens: baseAmountTokens(),
    posted,
  };
}

export async function lookupInvoice(invoiceId: string): Promise<{
  invoice: InvoiceCreated;
  paid: InvoicePaid | null;
} | null> {
  const record = await loadInvoice(invoiceId);
  if (!record) return null;
  return { invoice: publicInvoice(record), paid: paidFromRecord(record) };
}
