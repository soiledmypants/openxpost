import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = [/@solana\/web3\.js/, /rpc-websockets/, /\bKeypair\b/];
const importRe = /(?:from\s+|import\s+)["'](\.[^"']+)["']/g;

const entries = ["netlify/functions/invoice.ts", "server/invoice.ts", "server/invoice-http.ts"];
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
  const source = readFileSync(join(root, file), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(source)) {
      throw new Error(`${file} must not mention ${pattern} (invoice POST stays zero-solana)`);
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

const required = ["server/invoice.ts", "server/invoice-http.ts", "server/store.ts", "pay/amount.ts"];
for (const file of required) {
  if (!seen.has(file)) {
    throw new Error(`invoice isolate graph missed ${file}`);
  }
}

console.log(`invoice POST isolate ok (${[...seen].sort().join(", ")})`);
