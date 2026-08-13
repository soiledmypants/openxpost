import { isAmountUi, parseAmountRaw } from "./amount";
import type { CreateInvoiceInput, InvoiceCreated, InvoicePaid, PostTweetResponse } from "./types";
import { DEFAULT_AMOUNT_TOKENS, readInvoicePaid } from "./types";

async function parseJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  return (await response.json()) as T;
}

function asAmountTokens(value: unknown, amountUi: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const fromUi = Number(amountUi);
  return Number.isFinite(fromUi) ? fromUi : DEFAULT_AMOUNT_TOKENS;
}

/** Calls Pay. Returns the locked createInvoice shape. Extra keys are ignored. */
export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceCreated> {
  const body = await parseJson<{
    invoiceId?: string;
    receivePubkey?: string;
    mint?: string;
    amountTokens?: number;
    amountUi?: string;
    amountRaw?: string | number;
    error?: string;
  }>("/api/invoice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const amountUi = typeof body.amountUi === "string" ? body.amountUi.trim() : "";
  const amountRawRaw = body.amountRaw;
  const amountRaw =
    typeof amountRawRaw === "string"
      ? amountRawRaw.trim()
      : typeof amountRawRaw === "number" && Number.isFinite(amountRawRaw)
        ? String(Math.trunc(amountRawRaw))
        : "";
  if (
    !body.invoiceId ||
    !body.receivePubkey ||
    !body.mint ||
    !isAmountUi(amountUi) ||
    !parseAmountRaw(amountRaw)
  ) {
    throw new Error(body.error ?? "Pay did not return an invoice.");
  }
  return {
    invoiceId: body.invoiceId,
    receivePubkey: body.receivePubkey,
    mint: body.mint,
    amountTokens: asAmountTokens(body.amountTokens, amountUi),
    amountUi,
    amountRaw,
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
