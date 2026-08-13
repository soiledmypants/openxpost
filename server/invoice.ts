import { postTextHash } from "../pay/hash";
import type { CreateInvoiceInput, InvoiceCreated, InvoicePaid, PublicBoard } from "../pay/types";
import { checkDraft } from "../src/lib/rules";
import { amountTokens, receivePubkey, tokenMint } from "./env";
import { settleInvoice } from "./onchain";
import { getStore, type StoredInvoice } from "./store";

function publicInvoice(record: StoredInvoice): InvoiceCreated {
  return {
    invoiceId: record.invoiceId,
    receivePubkey: record.receivePubkey,
    mint: record.mint,
    amountTokens: record.amountTokens,
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

  const record: StoredInvoice = {
    invoiceId: crypto.randomUUID(),
    orderId: input.orderId.trim(),
    postText,
    postTextHash: expectedHash,
    receivePubkey: receivePubkey(),
    mint: tokenMint(),
    amountTokens: amountTokens(),
    createdAt: Date.now(),
  };
  await (await getStore()).putInvoice(record);
  return publicInvoice(record);
}

export async function loadInvoice(invoiceId: string): Promise<StoredInvoice | null> {
  return (await getStore()).getInvoice(invoiceId);
}

export async function publicBoard(): Promise<PublicBoard> {
  const invoices = await (await getStore()).listInvoices();
  const posted = invoices
    .filter((row) => Boolean(row.tweetUrl && row.burnSignature && row.paidAt))
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? "") || b.createdAt - a.createdAt)
    .map((row) => ({
      invoiceId: row.invoiceId,
      tweetUrl: row.tweetUrl ?? "",
      burnSignature: row.burnSignature ?? "",
      paidAt: row.paidAt ?? "",
    }))
    .filter((row) => row.tweetUrl && row.burnSignature);
  return {
    receivePubkey: receivePubkey(),
    mint: tokenMint(),
    amountTokens: amountTokens(),
    posted,
  };
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
