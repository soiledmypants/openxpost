import { serveInvoice } from "../../server/invoice-http";

/** POST create + GET board. Paid lookup is a separate function so this bundle stays zero-solana. */
export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (req.method === "GET" && id) {
    const target = new URL("/.netlify/functions/paid", url.origin);
    target.searchParams.set("id", id);
    return fetch(target);
  }
  return serveInvoice(req);
};
