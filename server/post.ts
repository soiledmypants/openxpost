import { BASE_AMOUNT_RAW } from "../pay/amount";
import { postTextHash } from "../pay/hash";
import { statusUrl, type PostTweetResponse } from "../pay/types";
import { checkDraft } from "../src/lib/rules";
import { amountTokens as baseAmountTokens, receivePubkey, tokenMint } from "./env";
import { loadInvoice, paidFromRecord } from "./invoice";
import { getStore, type StoredInvoice } from "./store";
import { postTweetText } from "./x";

/** Tweet after pay. Never import invoice-status, onchain, web3, or spl-token. */

function asObject(body: unknown): Record<string, unknown> {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function field(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function recordFromPaidBody(
  raw: Record<string, unknown>,
  invoiceId: string,
  txSig: string,
): Promise<StoredInvoice> {
  const postText = field(raw, "postText");
  const fromPubkey = field(raw, "fromPubkey", "payer");
  const orderId = field(raw, "orderId") || invoiceId;
  const paidAt = new Date().toISOString();
  return {
    invoiceId,
    orderId,
    postText,
    postTextHash: postText ? await postTextHash(postText) : "",
    fromPubkey,
    receivePubkey: receivePubkey(),
    mint: tokenMint(),
    amountTokens: baseAmountTokens(),
    amountRaw: BASE_AMOUNT_RAW.toString(),
    createdAt: Date.now(),
    txSig,
    payer: fromPubkey || "paid",
    paidAt,
  };
}

export async function handlePost(body: unknown): Promise<{ status: number; body: PostTweetResponse }> {
  const raw = asObject(body);
  const invoiceId = field(raw, "invoiceId");
  const txSig = field(raw, "txSig", "signature");
  const postText = field(raw, "postText");
  const fromPubkey = field(raw, "fromPubkey", "payer");
  const orderId = field(raw, "orderId");
  if (!invoiceId) {
    return { status: 400, body: { ok: false, error: "invoiceId is required.", retry: false } };
  }

  let record = await loadInvoice(invoiceId);
  if (!record) {
    if (!txSig) {
      return { status: 404, body: { ok: false, error: "Unknown invoice.", retry: false } };
    }
    record = await recordFromPaidBody(raw, invoiceId, txSig);
    try {
      await (await getStore()).putInvoice(record);
    } catch {
      // Paid user still gets a tweet attempt if the store is down.
    }
  }
  if (record.tweetId && record.tweetUrl) {
    return { status: 200, body: { ok: true, tweetId: record.tweetId, tweetUrl: record.tweetUrl } };
  }

  if (txSig) {
    const paidAt = record.paidAt ?? new Date().toISOString();
    const payer = fromPubkey || record.fromPubkey || record.payer || record.expectedPayer || "paid";
    record = {
      ...record,
      txSig,
      payer,
      paidAt,
      postText: postText || record.postText,
      orderId: record.orderId || orderId || invoiceId,
    };
    if (!record.fromPubkey && fromPubkey) {
      record = { ...record, fromPubkey };
    }
    try {
      await (await getStore()).putInvoice(record);
    } catch {
      // Continue; client txSig is already paid.
    }
  }

  const paid = paidFromRecord(record);
  if (!paid) {
    return {
      status: 402,
      body: {
        ok: false,
        error: "Invoice is not paid yet. Payment is kept; retry tweet.",
        retry: true,
      },
    };
  }

  const hits = checkDraft(record.postText);
  if (hits.length > 0) {
    return { status: 400, body: { ok: false, error: hits.map((h) => h.message).join(" "), retry: false } };
  }

  try {
    const posted = await postTweetText(record.postText);
    const store = await getStore();
    await store.putInvoice({
      ...record,
      txSig: paid.txSig,
      payer: paid.payer,
      slot: paid.slot,
      paidAt: paid.paidAt,
      tweetId: posted.tweetId,
      tweetUrl: posted.tweetUrl || statusUrl(posted.tweetId),
    });
    return { status: 200, body: { ok: true, tweetId: posted.tweetId, tweetUrl: statusUrl(posted.tweetId) } };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "X did not accept the post. Payment is kept; retry.";
    try {
      await (await getStore()).putInvoice({ ...record, lastError: message });
    } catch {
      // Tweet error still returns to the client.
    }
    return { status: 502, body: { ok: false, error: message, retry: true } };
  }
}
