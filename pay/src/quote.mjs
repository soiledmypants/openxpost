import { randomUUID } from "node:crypto";
import { bucketLamports, solUsd } from "./price.mjs";
import { insertInvoice, usedSuffixes } from "./store.mjs";

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function pickSuffix(used, suffixMod) {
  const free = [];
  for (let i = 1; i < suffixMod; i++) {
    if (!used.has(i)) free.push(i);
  }
  if (!free.length) throw new Error("no unused suffix in bucket");
  return free[Math.floor(Math.random() * free.length)];
}

export async function createInvoice({ orderId }) {
  const treasury = process.env.TREASURY_PUBKEY;
  if (!treasury) {
    throw new Error(
      "TREASURY_PUBKEY is required (public address only). Never set a private key."
    );
  }

  const amountUsd = envNum("AMOUNT_USD", 1);
  const suffixMod = envNum("SUFFIX_MOD", 10000);
  const windowSec = envNum("PAY_WINDOW_SEC", 900);

  const usd = await solUsd();
  const bucket = bucketLamports(usd, amountUsd, suffixMod);
  const suffix = pickSuffix(await usedSuffixes(bucket, suffixMod), suffixMod);
  const lamports = bucket + suffix;
  const amountSol = (lamports / 1e9).toFixed(9);

  const now = Date.now();
  const invoiceId = randomUUID();
  const expiresAt = new Date(now + windowSec * 1000).toISOString();
  const payUri = `solana:${treasury}?amount=${amountSol}`;

  await insertInvoice({
    id: invoiceId,
    orderId,
    treasury,
    lamports,
    amountSol,
    status: "open",
    createdAt: new Date(now).toISOString(),
    expiresAt,
  });

  return {
    invoiceId,
    treasury,
    lamports,
    amountSol,
    expiresAt,
    payUri,
  };
}
