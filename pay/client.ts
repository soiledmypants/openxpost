import type {
  CreateInvoiceInput,
  InvoiceCreated,
  InvoicePaid,
  PostedPair,
  PostTweetResponse,
  PublicBoard,
} from "./types";
import { BASE_AMOUNT_RAW, formatAmountUi, isAmountUi, parseAmountRaw } from "./amount";
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

function readCreatedInvoice(body: unknown): InvoiceCreated | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const invoiceId = typeof raw.invoiceId === "string" ? raw.invoiceId.trim() : "";
  const receivePubkey = typeof raw.receivePubkey === "string" ? raw.receivePubkey.trim() : "";
  const mint = typeof raw.mint === "string" ? raw.mint.trim() : "";
  const amountUi = typeof raw.amountUi === "string" ? raw.amountUi.trim() : "";
  const amountRawRaw = raw.amountRaw;
  const amountRaw =
    typeof amountRawRaw === "string"
      ? amountRawRaw.trim()
      : typeof amountRawRaw === "number" && Number.isFinite(amountRawRaw)
        ? String(Math.trunc(amountRawRaw))
        : "";
  if (
    !invoiceId ||
    !receivePubkey ||
    !mint ||
    !isAmountUi(amountUi) ||
    !parseAmountRaw(amountRaw)
  ) {
    return null;
  }
  const amountTokens = Number(raw.amountTokens);
  return {
    invoiceId,
    receivePubkey,
    mint,
    amountTokens: Number.isFinite(amountTokens) ? amountTokens : Number(amountUi),
    amountUi,
    amountRaw,
  };
}

function localInvoice(): InvoiceCreated {
  return {
    invoiceId: crypto.randomUUID(),
    receivePubkey: DEFAULT_RECEIVE_PUBKEY,
    mint: DEFAULT_TOKEN_MINT,
    amountTokens: DEFAULT_AMOUNT_TOKENS,
    amountUi: formatAmountUi(BASE_AMOUNT_RAW),
    amountRaw: BASE_AMOUNT_RAW.toString(),
  };
}

/** POST /api/invoice when it works. Never blocks pay. Fixed 100,000 $POST — not a unique suffix. */
export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceCreated> {
  try {
    const response = await fetch("/api/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const invoice = readCreatedInvoice(body);
      if (invoice) return invoice;
    }
  } catch {
    // 502 / missing function must not block the wallet transfer.
  }
  return localInvoice();
}

export async function readPaid(invoiceId: string): Promise<InvoicePaid | null> {
  try {
    const body = await parseJson<unknown>(`/api/invoice?id=${encodeURIComponent(invoiceId)}`);
    return readInvoicePaid(body);
  } catch {
    return null;
  }
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
