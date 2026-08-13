import type { CreateInvoiceInput, InvoiceCreated, InvoicePaid, PostTweetResponse } from "./types";
import { readInvoicePaid } from "./types";

async function parseJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  return (await response.json()) as T;
}

/** Calls Pay. Returns the locked createInvoice shape. Extra keys are ignored. */
export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceCreated> {
  const body = await parseJson<InvoiceCreated & { error?: string }>("/api/invoice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!body.invoiceId || !body.receivePubkey || !body.mint || !body.amountTokens) {
    throw new Error(body.error ?? "Pay did not return an invoice.");
  }
  return {
    invoiceId: body.invoiceId,
    receivePubkey: body.receivePubkey,
    mint: body.mint,
    amountTokens: Number(body.amountTokens),
  };
}

export async function readPaid(invoiceId: string): Promise<InvoicePaid | null> {
  const body = await parseJson<unknown>(`/api/invoice?id=${encodeURIComponent(invoiceId)}`);
  return readInvoicePaid(body);
}

export async function postPaidTweet(invoiceId: string): Promise<PostTweetResponse> {
  try {
    return await parseJson<PostTweetResponse>("/api/post", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach the posting server. Payment is kept; retry.",
      retry: true,
    };
  }
}
