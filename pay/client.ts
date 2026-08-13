import type {
  CreateInvoiceInput,
  InvoiceCreated,
  InvoicePaid,
  PostedPair,
  PostTweetResponse,
  PublicBoard,
} from "./types";
import { parseAmountRaw } from "./amount";
import {
  DEFAULT_AMOUNT_TOKENS,
  DEFAULT_RECEIVE_PUBKEY,
  DEFAULT_TOKEN_MINT,
  readInvoicePaid,
  statusUrl,
} from "./types";

function envTrim(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function configuredReceive(): string {
  return envTrim(import.meta.env.VITE_TREASURY_ADDRESS) || DEFAULT_RECEIVE_PUBKEY;
}

function configuredMint(): string {
  return envTrim(import.meta.env.VITE_TOKEN_MINT) || DEFAULT_TOKEN_MINT;
}

function configuredAmount(): number {
  const n = Number(envTrim(import.meta.env.VITE_TOKEN_AMOUNT));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_AMOUNT_TOKENS;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function errorMessage(status: number, body: unknown, raw: string): string {
  const rec = asRecord(body);
  const fromBody = rec
    ? String(rec.errorMessage ?? rec.error ?? rec.message ?? rec.detail ?? "").trim()
    : "";
  const fromRaw = raw.trim();
  const detail = fromBody || fromRaw || "empty body";
  return `${status} ${detail}`;
}

async function readResponse(path: string, init?: RequestInit): Promise<{
  status: number;
  raw: string;
  body: unknown;
}> {
  const response = await fetch(path, init);
  const raw = await response.text();
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      body = null;
    }
  }
  return { status: response.status, raw, body };
}

function asField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asAmountTokens(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

function readCreated(body: unknown): InvoiceCreated | null {
  const rec = asRecord(body);
  if (!rec) return null;
  const invoiceId = asField(rec.invoiceId);
  const orderId = asField(rec.orderId);
  const receivePubkey = asField(rec.receivePubkey);
  const mint = asField(rec.mint);
  const fromPubkey = asField(rec.fromPubkey) || asField(rec.payer);
  const amountTokens = asAmountTokens(rec.amountTokens);
  const amountRawRaw = rec.amountRaw;
  const amountRaw =
    typeof amountRawRaw === "string"
      ? amountRawRaw.trim()
      : typeof amountRawRaw === "number" && Number.isFinite(amountRawRaw)
        ? String(Math.trunc(amountRawRaw))
        : "";
  if (
    !invoiceId ||
    !orderId ||
    !receivePubkey ||
    !mint ||
    !fromPubkey ||
    !Number.isFinite(amountTokens) ||
    !parseAmountRaw(amountRaw)
  ) {
    return null;
  }
  return {
    invoiceId,
    orderId,
    receivePubkey,
    mint,
    amountTokens,
    amountRaw,
    fromPubkey,
  };
}

/** Calls Pay. Returns the locked createInvoice shape. Extra keys are ignored. */
export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceCreated> {
  const { status, raw, body } = await readResponse("/api/invoice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const invoice = status === 200 ? readCreated(body) : null;
  if (!invoice) {
    throw new Error(errorMessage(status, body, raw));
  }
  return invoice;
}

export async function readPaid(invoiceId: string): Promise<InvoicePaid | null> {
  const { body } = await readResponse(`/api/invoice?id=${encodeURIComponent(invoiceId)}`);
  return readInvoicePaid(body);
}

export async function loadBoard(): Promise<PublicBoard> {
  try {
    const { status, body } = await readResponse("/api/invoice");
    const rec = status === 200 ? asRecord(body) : null;
    if (!rec) {
      return {
        receivePubkey: configuredReceive(),
        mint: configuredMint(),
        amountTokens: configuredAmount(),
        posted: [],
      };
    }
    const receivePubkey =
      typeof rec.receivePubkey === "string" && rec.receivePubkey.trim()
        ? rec.receivePubkey.trim()
        : configuredReceive();
    const mint =
      typeof rec.mint === "string" && rec.mint.trim() ? rec.mint.trim() : configuredMint();
    const amountTokens =
      typeof rec.amountTokens === "number" && Number.isFinite(rec.amountTokens) && rec.amountTokens > 0
        ? rec.amountTokens
        : configuredAmount();
    const posted: PostedPair[] = [];
    if (Array.isArray(rec.posted)) {
      for (const rawItem of rec.posted) {
        if (!rawItem || typeof rawItem !== "object") continue;
        const item = rawItem as Partial<PostedPair>;
        const tweetId = typeof item.tweetId === "string" ? item.tweetId.trim() : "";
        const tweetUrl =
          typeof item.tweetUrl === "string" && item.tweetUrl.trim()
            ? item.tweetUrl.trim()
            : tweetId
              ? statusUrl(tweetId)
              : "";
        const tweetText =
          typeof item.tweetText === "string"
            ? item.tweetText.trim()
            : typeof (item as { postText?: string }).postText === "string"
              ? String((item as { postText?: string }).postText).trim()
              : "";
        const txSig = typeof item.txSig === "string" ? item.txSig.trim() : "";
        const paidAt = typeof item.paidAt === "string" ? item.paidAt.trim() : "";
        const invoiceId = typeof item.invoiceId === "string" ? item.invoiceId.trim() : "";
        if (!tweetUrl || !txSig || !tweetText) continue;
        posted.push({
          invoiceId,
          tweetId,
          tweetUrl,
          tweetText,
          txSig,
          paidAt,
        });
      }
    }
    return { receivePubkey, mint, amountTokens, posted };
  } catch {
    return {
      receivePubkey: configuredReceive(),
      mint: configuredMint(),
      amountTokens: configuredAmount(),
      posted: [],
    };
  }
}

export async function postPaidTweet(input: {
  invoiceId: string;
  txSig: string;
  postText: string;
  fromPubkey: string;
}): Promise<PostTweetResponse> {
  try {
    const payload = {
      invoiceId: input.invoiceId,
      txSig: input.txSig.trim(),
      postText: input.postText,
      fromPubkey: input.fromPubkey,
    };
    const { status, raw, body } = await readResponse("/api/post", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const rec = asRecord(body);
    if (rec && rec.ok === true && typeof rec.tweetId === "string" && typeof rec.tweetUrl === "string") {
      return { ok: true, tweetId: rec.tweetId, tweetUrl: rec.tweetUrl };
    }
    const error = rec
      ? String(rec.error ?? rec.errorMessage ?? "").trim()
      : "";
    return {
      ok: false,
      error: error || errorMessage(status, body, raw),
      retry: rec?.retry === true || status >= 500,
    };
  } catch {
    return {
      ok: false,
      error: "Could not reach the posting server. Payment is kept; retry.",
      retry: true,
    };
  }
}
