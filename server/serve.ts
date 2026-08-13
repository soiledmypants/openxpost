import { handlePost } from "./post";

async function readJson(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

export async function serve(req: Request, kind: "post" | "invoice" = "post"): Promise<Response> {
  try {
    if (kind === "invoice") {
      const { handleInvoice } = await import("./invoice-http");
      const result = await handleInvoice(req.method, new URL(req.url), await readJson(req));
      return Response.json(result.body, { status: result.status });
    }
    if (req.method !== "POST") {
      return Response.json({ ok: false, error: "POST only." }, { status: 405 });
    }
    const result = await handlePost(await readJson(req));
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error.";
    return Response.json({ ok: false, error: message, retry: true }, { status: 500 });
  }
}
