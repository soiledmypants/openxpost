import { PURGE_TEST_POSTS } from "./hidden-test-posts";
import { getStore } from "./store";
import { deleteTweet } from "./x";

export async function handlePurgeTestPosts(): Promise<{
  status: number;
  body: { ok: true; deleted: { tweetId: string; invoiceId: string }[] };
}> {
  const store = await getStore();
  const deleted: { tweetId: string; invoiceId: string }[] = [];
  for (const post of PURGE_TEST_POSTS) {
    await deleteTweet(post.tweetId);
    await store.deleteInvoice(post.invoiceId);
    deleted.push({ tweetId: post.tweetId, invoiceId: post.invoiceId });
  }
  return { status: 200, body: { ok: true, deleted } };
}
