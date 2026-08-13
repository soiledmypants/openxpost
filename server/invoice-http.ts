import { createInvoice, lookupInvoice, publicBoard } from "./invoice";

function asObject(body: unknown): Record<string, unknown> {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

/** Invoice HTTP. Create/store/board only — no onchain/web3 imports. */
export async function handleInvoice(
  method: string,
  url: URL,
  body: unknown,
): Promise<{
  status: number;
  body: unknown;
}> {
  if (method === "POST") {
    const raw = asObject(body);
    const orderId = typeof raw.orderId === "string" ? raw.orderId : "";
    const postText = typeof raw.postText === "string" ? raw.postText : "";
    const postTextHash = typeof raw.postTextHash === "string" ? raw.postTextHash : "";
    const fromPubkey =
      typeof raw.fromPubkey === "string" && raw.fromPubkey.trim()
        ? raw.fromPubkey
        : typeof raw.payer === "string"
          ? raw.payer
          : "";
    try {
      const invoice = await createInvoice({ orderId, postText, postTextHash, fromPubkey });
      return { status: 200, body: invoice };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create invoice.";
      return { status: 400, body: { error: message } };
    }
  }

  if (method === "GET") {
    const id = url.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return { status: 200, body: await publicBoard() };
    }
    const status = await lookupInvoice(id);
    if (!status) return { status: 404, body: { error: "Unknown invoice." } };
    return { status: 200, body: { ...status.invoice, paid: status.paid } };
  }

  return { status: 405, body: { error: "GET or POST only." } };
}
