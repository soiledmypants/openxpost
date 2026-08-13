import { statusUrl, type PostTweetResponse } from "../pay/types";
import { checkDraft } from "../src/lib/rules";
import { invoiceStatus, loadInvoice } from "./invoice";
import { getStore } from "./store";
import { postTweetText } from "./x";

function asObject(body: unknown): Record<string, unknown> {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

export async function handleInvoice(method: string, url: URL, body: unknown): Promise<{
  status: number;
  body: unknown;
}> {
  if (method === "POST") {
    const raw = asObject(body);
    const orderId = typeof raw.orderId === "string" ? raw.orderId : "";
    const postText = typeof raw.postText === "string" ? raw.postText : "";
    const postTextHash = typeof raw.postTextHash === "string" ? raw.postTextHash : "";
    try {
      const { createInvoice } = await import("./invoice");
      const invoice = await createInvoice({ orderId, postText, postTextHash });
      return { status: 200, body: invoice };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create invoice.";
      return { status: 400, body: { error: message } };
    }
  }

  if (method === "GET") {
    const id = url.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      const { publicBoard } = await import("./invoice");
      return { status: 200, body: await publicBoard() };
    }
    const status = await invoiceStatus(id);
    if (!status) return { status: 404, body: { error: "Unknown invoice." } };
    return { status: 200, body: { ...status.invoice, paid: status.paid } };
  }

  return { status: 405, body: { error: "GET or POST only." } };
}

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
