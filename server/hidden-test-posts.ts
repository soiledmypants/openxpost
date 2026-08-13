/** The only posts POST /api/purge-test-posts may delete. Not read from the client. */
export const PURGE_TEST_POSTS = [
  {
    tweetId: "2088012574646272277",
    invoiceId: "71594a02-3d88-401a-a4db-3c5bf9c63f10",
  },
  {
    tweetId: "2088009871178203283",
    invoiceId: "0054dec0-2333-4506-91f8-629747c03577",
  },
] as const;

const hiddenInvoiceIds = new Set<string>(PURGE_TEST_POSTS.map((row) => row.invoiceId));
const hiddenTweetIds = new Set<string>(PURGE_TEST_POSTS.map((row) => row.tweetId));

export function isHiddenTestPost(invoiceId: string, tweetId = ""): boolean {
  return hiddenInvoiceIds.has(invoiceId) || (tweetId.length > 0 && hiddenTweetIds.has(tweetId));
}
