import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { mkdir, open, readFile, rename, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataDir = path.join(root, "data");
const wrapPath = path.join(dataDir, ".wrapkey");
const secretsPath = path.join(dataDir, "secrets.enc.json");
const feePayerPath = path.join(dataDir, "feepayer.key");

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
}

async function loadWrapKey() {
  await ensureDataDir();
  try {
    const buf = await readFile(wrapPath);
    if (buf.length !== KEY_LEN) throw new Error("wrap key length");
    return buf;
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
    const key = randomBytes(KEY_LEN);
    const fh = await open(wrapPath, "wx", 0o600);
    try {
      await fh.writeFile(key);
    } finally {
      await fh.close();
    }
    await chmod(wrapPath, 0o600);
    return key;
  }
}

async function loadSecrets() {
  try {
    return JSON.parse(await readFile(secretsPath, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

async function saveSecrets(map) {
  await ensureDataDir();
  const tmp = `${secretsPath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(map), { mode: 0o600 });
  await rename(tmp, secretsPath);
  await chmod(secretsPath, 0o600);
}

export async function wrapSecret(invoiceId, secretKey) {
  const key = await loadWrapKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([
    cipher.update(Buffer.from(secretKey)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const map = await loadSecrets();
  map[invoiceId] = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  };
  await saveSecrets(map);
}

export async function unwrapSecret(invoiceId) {
  const key = await loadWrapKey();
  const map = await loadSecrets();
  const row = map[invoiceId];
  if (!row) throw new Error("unwrap failed");
  try {
    const decipher = createDecipheriv(
      ALGO,
      key,
      Buffer.from(row.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(row.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(row.data, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new Error("unwrap failed");
  }
}

export async function wipeSecret(invoiceId) {
  const map = await loadSecrets();
  if (!(invoiceId in map)) return;
  delete map[invoiceId];
  await saveSecrets(map);
}

export async function loadInvoiceKeypair(invoiceId) {
  const secret = await unwrapSecret(invoiceId);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export async function loadFeePayer() {
  let raw;
  try {
    raw = JSON.parse(await readFile(feePayerPath, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new Error(
        "missing data/feepayer.key (JSON secret array). Do not put secrets in .env."
      );
    }
    throw new Error("feepayer key unreadable");
  }
  if (!Array.isArray(raw) || raw.length < 32) {
    throw new Error("feepayer key unreadable");
  }
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
