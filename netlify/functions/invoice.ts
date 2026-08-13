import { handleInvoice } from "../../server/invoice-http";

async function readJson(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

export default async (req: Request): Promise<Response> => {
  try {
    const result = await handleInvoice(req.method, new URL(req.url), await readJson(req));
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error.";
    return Response.json({ ok: false, error: message, retry: true }, { status: 500 });
  }
};
