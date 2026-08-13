import { statusUrl, type PostTweetResponse } from "../pay/types";
import { checkDraft } from "../src/lib/rules";
import { loadInvoice } from "./invoice";
import { invoiceStatus } from "./invoice-status";
import { getStore } from "./store";
import { postTweetText } from "./x";

function asObject(body: unknown): Record<string, unknown> {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

export async function handlePost(body: unknown): Promise<{ status: number; body: PostTweetResponse }> {
  const raw = asObject(body);
  const invoiceId = String(raw.invoiceId ?? "").trim();
  const txSig = String(raw.txSig ?? raw.signature ?? "").trim();
  if (!invoiceId) {
    return { status: 400, body: { ok: false, error: "invoiceId is required.", retry: false } };
  }

  let record = await loadInvoice(invoiceId);
  if (!record) {
    return { status: 404, body: { ok: false, error: "Unknown invoice.", retry: false } };
  }
  if (record.tweetId && record.tweetUrl) {
    return { status: 200, body: { ok: true, tweetId: record.tweetId, tweetUrl: record.tweetUrl } };
  }

  if (txSig && !record.txSig) {
    const paidAt = record.paidAt ?? new Date().toISOString();
    record = {
      ...record,
      txSig,
      payer: record.fromPubkey ?? record.payer ?? "",
      paidAt,
    };
    await (await getStore()).putInvoice(record);
  }

  const status = await invoiceStatus(invoiceId);
  const paid = status?.paid;
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
    await (await getStore()).putInvoice({ ...record, lastError: message });
    return { status: 502, body: { ok: false, error: message, retry: true } };
  }
}
