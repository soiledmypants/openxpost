import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = [
  /@solana\/web3\.js/,
  /@solana\/spl-token/,
  /rpc-websockets/,
  /\bKeypair\b/,
  /(?:from\s+|import\s*\(?\s*)["'][^"']*invoice-status["']/,
  /(?:from\s+|import\s*\(?\s*)["'][^"']*onchain["']/,
];
const blockedFiles = new Set(["server/invoice-status.ts", "server/onchain.ts", "server/status.ts"]);
const importRe = /(?:from\s+|import\s*\(?\s*)["'](\.[^"']+)["']/g;

const entries = ["netlify/functions/post.ts", "server/post.ts"];
const seen = new Set();
const queue = [...entries];

function resolveImport(fromFile, spec) {
  const base = join(dirname(join(root, fromFile)), spec);
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.js`, join(base, "index.ts")];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate.slice(root.length + 1);
    } catch {
      /* try next */
    }
  }
  return null;
}

while (queue.length > 0) {
  const file = queue.shift();
  if (!file || seen.has(file)) continue;
  seen.add(file);
  if (blockedFiles.has(file)) {
    throw new Error(`${file} must not be in the /api/post bundle`);
  }
  const source = readFileSync(join(root, file), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(source)) {
      throw new Error(`${file} must not mention ${pattern} (POST /api/post stays zero-solana)`);
    }
  }
  importRe.lastIndex = 0;
  let match = importRe.exec(source);
  while (match) {
    const spec = match[1];
    if (spec) {
      const next = resolveImport(file, spec);
      if (next) queue.push(next);
    }
    match = importRe.exec(source);
  }
}

const required = ["server/post.ts", "server/invoice.ts", "server/store.ts", "server/x.ts"];
for (const file of required) {
  if (!seen.has(file)) {
    throw new Error(`post isolate graph missed ${file}`);
  }
}

console.log(`post isolate ok (${[...seen].sort().join(", ")})`);
