export async function readJson(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

export function asObject(body: unknown): Record<string, unknown> {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

export function jsonResult(status: number, body: unknown): { status: number; body: unknown } {
  return { status, body };
}

export async function serveJson(
  work: () => Promise<{ status: number; body: unknown }>,
): Promise<Response> {
  try {
    const result = await work();
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error.";
    return Response.json({ ok: false, error: message, retry: true }, { status: 500 });
  }
}
