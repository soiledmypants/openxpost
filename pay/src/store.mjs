import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "data");
const file = path.join(dir, "invoices.json");

async function load() {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return { invoices: [], seen: [] };
  }
}

async function save(data) {
  await mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

export async function insertInvoice(inv) {
  const data = await load();
  const taken = data.invoices.some(
    (row) => row.status === "open" && row.lamports === inv.lamports
  );
  if (taken) throw new Error("lamports collision");
  data.invoices.push(inv);
  await save(data);
  return inv;
}

export async function usedSuffixes(bucket, suffixMod) {
  const data = await load();
  const out = new Set();
  for (const inv of data.invoices) {
    if (inv.status !== "open") continue;
    if (Math.floor(inv.lamports / suffixMod) * suffixMod !== bucket) continue;
    const suffix = inv.lamports - bucket;
    if (suffix >= 1 && suffix < suffixMod) out.add(suffix);
  }
  return out;
}

export async function findOpenByLamports(lamports) {
  const data = await load();
  return (
    data.invoices.find(
      (inv) => inv.status === "open" && inv.lamports === lamports
    ) || null
  );
}

export async function isSeen(signature) {
  const data = await load();
  return data.seen.includes(signature);
}

export async function markSeen(signature) {
  const data = await load();
  if (!data.seen.includes(signature)) {
    data.seen.push(signature);
    await save(data);
  }
}

/** CAS: only an open invoice becomes paid; signature must be unused. */
export async function markPaid(invoiceId, { signature, paidAt, payer, slot }) {
  const data = await load();
  if (data.seen.includes(signature)) return null;
  const inv = data.invoices.find((row) => row.id === invoiceId);
  if (!inv || inv.status !== "open") return null;
  if (data.invoices.some((row) => row.signature === signature)) return null;
  inv.status = "paid";
  inv.signature = signature;
  inv.paidAt = paidAt;
  inv.payer = payer;
  inv.slot = slot;
  data.seen.push(signature);
  await save(data);
  return inv;
}

export async function expireOpen(graceSec) {
  const data = await load();
  const cutoff = Date.now() - graceSec * 1000;
  let n = 0;
  for (const inv of data.invoices) {
    if (inv.status !== "open") continue;
    if (Date.parse(inv.expiresAt) > cutoff) continue;
    inv.status = "expired";
    n++;
  }
  if (n) await save(data);
  return n;
}
