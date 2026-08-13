import { serveJson } from "./http";

export async function handleInvoicePaid(
  method: string,
  url: URL,
): Promise<{ status: number; body: unknown }> {
  if (method !== "GET") {
    return { status: 405, body: { error: "GET only." } };
  }
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return { status: 400, body: { error: "id is required." } };
  }
  const { invoiceStatus } = await import("./status");
  const status = await invoiceStatus(id);
  if (!status) return { status: 404, body: { error: "Unknown invoice." } };
  return { status: 200, body: { ...status.invoice, paid: status.paid } };
}

export async function servePaid(req: Request): Promise<Response> {
  return serveJson(async () => handleInvoicePaid(req.method, new URL(req.url)));
}
