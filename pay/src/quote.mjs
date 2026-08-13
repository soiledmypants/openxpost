import { randomUUID } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { wrapSecret, wipeSecret } from "./keys.mjs";
import { AMOUNT_TOKENS, MINT } from "./mint.mjs";
import { insertInvoice } from "./store.mjs";

export async function createInvoice({ orderId, postText, postTextHash }) {
  if (!orderId) throw new Error("orderId required");
  const invoiceId = randomUUID();
  const kp = Keypair.generate();
  const receivePubkey = kp.publicKey.toBase58();

  await wrapSecret(invoiceId, kp.secretKey);
  try {
    await insertInvoice({
      id: invoiceId,
      orderId,
      mint: MINT,
      amountTokens: AMOUNT_TOKENS,
      amountRaw: "10000000000",
      receivePubkey,
      postText: postText ?? "",
      postTextHash: postTextHash ?? "",
      status: "open",
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    await wipeSecret(invoiceId);
    throw err;
  }

  return {
    invoiceId,
    orderId,
    mint: MINT,
    amountTokens: AMOUNT_TOKENS,
    receivePubkey,
  };
}
