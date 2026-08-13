import type {
  CreateInvoiceInput,
  InvoiceCreated,
  InvoicePaid,
  PostedPair,
  PostTweetResponse,
  PublicBoard,
} from "./types";
import {
  DEFAULT_AMOUNT_TOKENS,
  DEFAULT_RECEIVE_PUBKEY,
  DEFAULT_TOKEN_MINT,
  readInvoicePaid,
} from "./types";

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

export async function loadBoard(): Promise<PublicBoard> {
  try {
    const body = await parseJson<Partial<PublicBoard> & { error?: string }>("/api/invoice");
    const receivePubkey =
      typeof body.receivePubkey === "string" && body.receivePubkey.trim()
        ? body.receivePubkey.trim()
        : DEFAULT_RECEIVE_PUBKEY;
    const mint =
      typeof body.mint === "string" && body.mint.trim() ? body.mint.trim() : DEFAULT_TOKEN_MINT;
    const amountTokens =
      typeof body.amountTokens === "number" && Number.isFinite(body.amountTokens) && body.amountTokens > 0
        ? body.amountTokens
        : DEFAULT_AMOUNT_TOKENS;
    const posted: PostedPair[] = [];
    if (Array.isArray(body.posted)) {
      for (const raw of body.posted) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Partial<PostedPair>;
        const tweetUrl = typeof item.tweetUrl === "string" ? item.tweetUrl.trim() : "";
        const burnSignature = typeof item.burnSignature === "string" ? item.burnSignature.trim() : "";
        const paidAt = typeof item.paidAt === "string" ? item.paidAt.trim() : "";
        const invoiceId = typeof item.invoiceId === "string" ? item.invoiceId.trim() : "";
        if (!tweetUrl || !burnSignature) continue;
        posted.push({
          invoiceId,
          tweetUrl,
          burnSignature,
          paidAt,
        });
      }
    }
    return { receivePubkey, mint, amountTokens, posted };
  } catch {
    return {
      receivePubkey: DEFAULT_RECEIVE_PUBKEY,
      mint: DEFAULT_TOKEN_MINT,
      amountTokens: DEFAULT_AMOUNT_TOKENS,
      posted: [],
    };
  }
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
