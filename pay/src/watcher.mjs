import { Connection, PublicKey } from "@solana/web3.js";
import { burnAndClose } from "./burn.mjs";
import { tokenInflows } from "./extract.mjs";
import { loadFeePayer, loadInvoiceKeypair, wipeSecret } from "./keys.mjs";
import { amountRaw, ataFor, loadMint } from "./mint.mjs";
import { paidEvent } from "./notify.mjs";
import { isSeen, listOpen, markPaid, markSeen } from "./store.mjs";

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function pollInvoice(connection, inv, mintPk, programId, feePayer, dryRun) {
  const owner = new PublicKey(inv.receivePubkey);
  const ata = ataFor(owner, mintPk, programId);
  const ataStr = ata.toBase58();
  const sigs = await connection.getSignaturesForAddress(ata, { limit: 30 });

  for (const s of [...sigs].reverse()) {
    if (await isSeen(s.signature)) continue;
    if (s.err) {
      await markSeen(s.signature);
      continue;
    }

    const tx = await connection.getTransaction(s.signature, {
      commitment: "finalized",
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    });
    if (tx == null) continue;

    if (tx.meta?.err) {
      await markSeen(s.signature);
      continue;
    }

    const inflows = tokenInflows(tx, ataStr, amountRaw);
    if (!inflows.length) {
      await markSeen(s.signature);
      continue;
    }

    const inflow = inflows[0];
    const fromPubkey = inflow.authority || inflow.source;
    const paidAt = tx.blockTime
      ? new Date(tx.blockTime * 1000).toISOString()
      : new Date().toISOString();

    let burnSignature = "DRY_RUN";
    if (!dryRun) {
      if (!feePayer) throw new Error("fee payer required");
      const invoiceKp = await loadInvoiceKeypair(inv.id);
      burnSignature = await burnAndClose({
        connection,
        ata,
        mint: mintPk,
        owner: invoiceKp,
        feePayer,
        programId,
        amount: amountRaw,
      });
      await wipeSecret(inv.id);
    }

    const paid = await markPaid(inv.id, {
      fromPubkey,
      signature: s.signature,
      burnSignature,
      paidAt,
    });
    if (!paid) {
      await markSeen(s.signature);
      continue;
    }
    console.log(JSON.stringify(paidEvent(paid)));
    return;
  }
}

export async function watch() {
  const dryRun = process.env.DRY_RUN === "1";
  if (dryRun) {
    console.error("DRY_RUN=1 (local tests only). Live matching is DRY_RUN=0.");
  }

  const rpc = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpc, { commitment: "finalized" });
  const pollMs = envNum("POLL_MS", 2000);

  let feePayer = null;
  if (!dryRun) {
    feePayer = await loadFeePayer();
  }

  const { mintPk, programId } = await loadMint(connection);
  console.error(
    `ROOTS burn watcher mint=${mintPk.toBase58()} program=${programId.toBase58()} commitment=finalized`
  );

  for (;;) {
    try {
      const open = await listOpen();
      for (const inv of open) {
        try {
          await pollInvoice(
            connection,
            inv,
            mintPk,
            programId,
            feePayer,
            dryRun
          );
        } catch (err) {
          console.error("invoice poll error", err?.message || "error");
        }
      }
    } catch (err) {
      console.error("poll error", err?.message || "error");
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
