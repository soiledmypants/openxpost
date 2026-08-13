import { handlePurgeTestPosts } from "../../server/purge-test-posts";

/** POST only. Deletes the two hardcoded test posts. Ignores request body IDs. */
export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== "POST") {
      return Response.json({ ok: false, error: "POST only." }, { status: 405 });
    }
    const result = await handlePurgeTestPosts();
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error.";
    return Response.json({ ok: false, error: message, retry: true }, { status: 500 });
  }
};
