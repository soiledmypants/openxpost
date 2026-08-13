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
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

export async function insertInvoice(inv) {
  const data = await load();
  data.invoices.push(inv);
  await save(data);
  return inv;
}

export async function listOpen() {
  const data = await load();
  return data.invoices.filter((inv) => inv.status === "open");
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

/** CAS: only an open invoice becomes paid; payment signature must be unused. */
export async function markPaid(invoiceId, fields) {
  const data = await load();
  if (fields.signature && data.seen.includes(fields.signature)) return null;
  const inv = data.invoices.find((row) => row.id === invoiceId);
  if (!inv || inv.status !== "open") return null;
  if (
    fields.signature &&
    data.invoices.some((row) => row.signature === fields.signature)
  ) {
    return null;
  }
  inv.status = "paid";
  inv.fromPubkey = fields.fromPubkey;
  inv.signature = fields.signature;
  inv.burnSignature = fields.burnSignature;
  inv.paidAt = fields.paidAt;
  if (fields.signature && !data.seen.includes(fields.signature)) {
    data.seen.push(fields.signature);
  }
  await save(data);
  return inv;
}
