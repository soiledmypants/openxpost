/**
 * Production store must use Netlify Blobs. Restore seeds the board without X.
 * Not bundled into the Docs tab (.mjs).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const storeSrc = readFileSync(join(root, "server/store.ts"), "utf8");
const invoiceSrc = readFileSync(join(root, "server/invoice.ts"), "utf8");
const restoreSrc = readFileSync(join(root, "server/restore-board.ts"), "utf8");
const toml = readFileSync(join(root, "netlify.toml"), "utf8");

if (!storeSrc.includes('from "@netlify/blobs"')) {
  throw new Error("server/store.ts must statically import @netlify/blobs");
}
if (!storeSrc.includes("allowFileFallback")) {
  throw new Error("server/store.ts must gate the file fallback");
}
if (/catch\s*\{[^}]*cached = fileStore\(\)/s.test(storeSrc) && !storeSrc.includes("allowFileFallback()")) {
  throw new Error("server/store.ts must not silently fall back to the file store");
}
if (!storeSrc.includes("Netlify Blobs is required")) {
  throw new Error("production getStore must throw when Blobs is unavailable");
}
if (!toml.includes('external_node_modules = ["@netlify/blobs"]')) {
  throw new Error("netlify.toml must externalize @netlify/blobs for the function runtime");
}
if (/invoices = \[\]/.test(invoiceSrc)) {
  throw new Error("publicBoard must not swallow listInvoices into invoices = []");
}
if (!invoiceSrc.includes("restorePublishedBoard")) {
  throw new Error("publicBoard must restore already-published posts");
}
if (/postTweet|from ["'].*\/x["']|from ["'].*\/post["']/.test(restoreSrc)) {
  throw new Error("restore-board must not tweet or import X / post");
}

const tweetIds = [
  "2088107102757585019",
  "2088106971731804630",
  "2088106281609404419",
  "2088105526877958181",
  "2088105132311417335",
  "2088104878455378166",
];
for (const tweetId of tweetIds) {
  if (!restoreSrc.includes(`restore-${tweetId}`) && !restoreSrc.includes(tweetId)) {
    throw new Error(`restore-board missing tweet ${tweetId}`);
  }
}

const runner = join(root, "scripts", "assert-store-blobs.runner.mts");
const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--no-warnings", runner],
  { cwd: root, encoding: "utf8" },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);
