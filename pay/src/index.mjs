import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInvoice } from "./quote.mjs";
import { watch } from "./watcher.mjs";

function loadEnv() {
  try {
    const text = readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    // no .env
  }
}

loadEnv();
if (process.env.DRY_RUN !== "1") process.env.DRY_RUN = "0";

if (process.argv.includes("--quote")) {
  const orderId = process.env.ORDER_ID || randomUUID();
  const postText = process.env.POST_TEXT ?? "";
  const postTextHash = process.env.POST_TEXT_HASH ?? "";
  const out = await createInvoice({ orderId, postText, postTextHash });
  process.stdout.write(JSON.stringify(out) + "\n");
} else {
  await watch();
}
