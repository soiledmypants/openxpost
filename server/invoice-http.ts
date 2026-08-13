import { createInvoice, publicBoard } from "./invoice";
import { asObject, readJson, serveJson } from "./http";

export async function handleInvoice(
  method: string,
  url: URL,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  if (method === "POST") {
    const raw = asObject(body);
    const orderId = typeof raw.orderId === "string" ? raw.orderId : "";
    const postText = typeof raw.postText === "string" ? raw.postText : "";
    const postTextHash = typeof raw.postTextHash === "string" ? raw.postTextHash : "";
    try {
      const invoice = await createInvoice({ orderId, postText, postTextHash });
      return { status: 200, body: invoice };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create invoice.";
      return { status: 400, body: { error: message, errorMessage: message } };
    }
  }

  if (method === "GET") {
    const id = url.searchParams.get("id")?.trim() ?? "";
    if (id) {
      return { status: 400, body: { error: "Use the paid status path for invoice id lookup." } };
    }
    return { status: 200, body: await publicBoard() };
  }

  return { status: 405, body: { error: "GET or POST only." } };
}

export async function serveInvoice(req: Request): Promise<Response> {
  return serveJson(async () => {
    const url = new URL(req.url);
    const body = req.method === "GET" ? {} : await readJson(req);
    return handleInvoice(req.method, url, body);
  });
}
