import { handlePost } from "../../server/post";

async function readJson(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== "POST") {
      return Response.json({ ok: false, error: "POST only." }, { status: 405 });
    }
    const result = await handlePost(await readJson(req));
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error.";
    return Response.json({ ok: false, error: message, retry: true }, { status: 500 });
  }
};
