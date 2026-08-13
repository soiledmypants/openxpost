import { statusUrl, type PostTweetResponse } from "../pay/types";
import { checkDraft } from "../src/lib/rules";
import { asObject, readJson, serveJson } from "./http";
import { loadInvoice } from "./invoice";
import { getStore } from "./store";
import { postTweetText } from "./x";

export async function handlePost(body: unknown): Promise<{ status: number; body: PostTweetResponse }> {
  const invoiceId = String(asObject(body).invoiceId ?? "").trim();
  if (!invoiceId) {
    return { status: 400, body: { ok: false, error: "invoiceId is required.", retry: false } };
  }

  const record = await loadInvoice(invoiceId);
  if (!record) {
    return { status: 404, body: { ok: false, error: "Unknown invoice.", retry: false } };
  }
  if (record.tweetId && record.tweetUrl) {
    return { status: 200, body: { ok: true, tweetId: record.tweetId, tweetUrl: record.tweetUrl } };
  }

  const { invoiceStatus } = await import("./status");
  const status = await invoiceStatus(invoiceId);
  const paid = status?.paid;
  if (!paid) {
    return {
      status: 402,
      body: {
        ok: false,
        error: "Invoice is not paid yet (transfer + burn). Payment is kept; retry.",
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
      burnSignature: paid.burnSignature,
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

export async function servePost(req: Request): Promise<Response> {
  return serveJson(async () => {
    if (req.method !== "POST") {
      return { status: 405, body: { ok: false, error: "POST only." } };
    }
    return handlePost(await readJson(req));
  });
}
