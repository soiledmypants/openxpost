import { handleInvoice } from "../../server/invoice-http";

async function readJson(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

/** POST create + GET board. Paid lookup is a separate function so this bundle stays zero-solana. */
export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (req.method === "GET" && id) {
    const target = new URL("/.netlify/functions/paid", url.origin);
    target.searchParams.set("id", id);
    return fetch(target);
  }
  try {
    const result = await handleInvoice(req.method, url, await readJson(req));
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error.";
    return Response.json({ ok: false, error: message, retry: true }, { status: 500 });
  }
};
