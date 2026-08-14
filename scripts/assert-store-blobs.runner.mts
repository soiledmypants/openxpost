import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicBoard } from "../server/invoice.ts";
import { resetRestoreCache, restoreInvoiceId, restorePublishedBoard } from "../server/restore-board.ts";
import { allowFileFallback, getStore, resetStoreCache } from "../server/store.ts";

const tweetIds = [
  "2088107102757585019",
  "2088106971731804630",
  "2088106281609404419",
  "2088105526877958181",
  "2088105132311417335",
  "2088104878455378166",
];

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const prevCwd = process.cwd();
const prevLambda = process.env.AWS_LAMBDA_FUNCTION_NAME;
const prevContext = process.env.CONTEXT;
const prevDev = process.env.NETLIFY_DEV;
const work = await mkdtemp(join(tmpdir(), "openxpost-store-"));

try {
  process.chdir(work);
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  delete process.env.CONTEXT;
  delete process.env.NETLIFY_DEV;
  resetStoreCache();
  resetRestoreCache();

  assert(allowFileFallback() === true, "local getStore may use the file fallback");

  process.env.AWS_LAMBDA_FUNCTION_NAME = "invoice";
  assert(allowFileFallback() === false, "deployed functions must not use the file fallback");
  resetStoreCache();
  let threw = false;
  try {
    await getStore();
  } catch (error) {
    threw = error instanceof Error && error.message.includes("Netlify Blobs is required");
  }
  assert(threw, "production getStore must throw when Blobs context is missing");

  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  process.env.NETLIFY_DEV = "true";
  assert(allowFileFallback() === true, "netlify dev may use the file fallback");
  delete process.env.NETLIFY_DEV;
  resetStoreCache();

  const store = await getStore();
  await restorePublishedBoard();
  await restorePublishedBoard();
  const listed = await store.listInvoices();
  assert(listed.length === 6, `restore should write 6 invoices, got ${listed.length}`);
  for (const tweetId of tweetIds) {
    const row = await store.getInvoice(restoreInvoiceId(tweetId));
    assert(row, `missing restore-${tweetId}`);
    assert(row.tweetId === tweetId, `tweetId mismatch for ${tweetId}`);
    assert(row.tweetUrl === `https://x.com/OpenXPost/status/${tweetId}`, `tweetUrl mismatch for ${tweetId}`);
    assert(row.txSig && row.paidAt && row.postText, `incomplete restore ${tweetId}`);
    assert(row.amountTokens === 100000, "restore amountTokens must stay 100000");
    assert(row.amountRaw === "100000000000", "restore amountRaw must stay 100000000000");
    assert(row.mint === "AY4xWaMBaMS9fgzxuacLKrkP52mK4AvPjRxR5bbpump", "restore mint must stay the live CA");
    assert(row.receivePubkey === "NBQhuKpHq4M6wmGmgAhZKt4yCJ1JqxY7h8Cf3SM2mMQ", "restore treasury must stay NBQhuK…");
  }

  const first = listed.find((row) => row.invoiceId === restoreInvoiceId(tweetIds[0] ?? ""));
  assert(first, "newest restore row should exist");
  first.postText = "mutated";
  await store.putInvoice(first);
  resetRestoreCache();
  await restorePublishedBoard();
  const again = await store.getInvoice(restoreInvoiceId(tweetIds[0] ?? ""));
  assert(again?.postText === "mutated", "restore must leave an existing invoiceId alone");

  const board = await publicBoard();
  assert(board.posted.length === 6, `publicBoard should list 6 restored posts, got ${board.posted.length}`);
  assert(board.posted[0]?.tweetId === tweetIds[0], "publicBoard must sort newest first");
  assert(board.posted[5]?.tweetId === tweetIds[5], "publicBoard oldest restored row is last");
  for (const row of board.posted) {
    assert(row.tweetText && row.tweetUrl && row.txSig, "each board row needs tweetText, tweetUrl, txSig");
  }
  assert(board.mint === "AY4xWaMBaMS9fgzxuacLKrkP52mK4AvPjRxR5bbpump", "board mint unchanged");
  assert(board.receivePubkey === "NBQhuKpHq4M6wmGmgAhZKt4yCJ1JqxY7h8Cf3SM2mMQ", "board treasury unchanged");
  assert(board.amountTokens === 100000, "board amount unchanged");

  console.log("store blobs + restore board ok");
} finally {
  process.chdir(prevCwd);
  if (prevLambda === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  else process.env.AWS_LAMBDA_FUNCTION_NAME = prevLambda;
  if (prevContext === undefined) delete process.env.CONTEXT;
  else process.env.CONTEXT = prevContext;
  if (prevDev === undefined) delete process.env.NETLIFY_DEV;
  else process.env.NETLIFY_DEV = prevDev;
  resetStoreCache();
  resetRestoreCache();
  await rm(work, { recursive: true, force: true });
}
