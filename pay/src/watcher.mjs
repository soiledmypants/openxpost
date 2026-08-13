import { Connection, PublicKey } from "@solana/web3.js";
import { extractNativeTransfers } from "./extract.mjs";
import { paidEvent } from "./notify.mjs";
import {
  expireOpen,
  findOpenByLamports,
  isSeen,
  markPaid,
  markSeen,
} from "./store.mjs";

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function pollOnce(connection, treasury, graceSec) {
  const dryRun = process.env.DRY_RUN === "1";
  const sigs = await connection.getSignaturesForAddress(new PublicKey(treasury), {
    limit: 40,
  });

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

    const blockTime = tx.blockTime;
    const transfers = extractNativeTransfers(tx, treasury);

    for (const t of transfers) {
      const inv = await findOpenByLamports(t.lamports);
      if (!inv) continue;
      const created = Date.parse(inv.createdAt) / 1000;
      const expires = Date.parse(inv.expiresAt) / 1000;
      if (!Number.isFinite(blockTime)) continue;
      if (blockTime < created || blockTime > expires + graceSec) continue;

      const fields = {
        signature: s.signature,
        paidAt: new Date(blockTime * 1000).toISOString(),
        payer: t.source,
        slot: tx.slot,
      };
      const paid = dryRun
        ? { ...inv, ...fields, status: "paid" }
        : await markPaid(inv.id, fields);
      if (!paid) continue;
      console.log(JSON.stringify(paidEvent(paid)));
    }

    await markSeen(s.signature);
  }
}

export async function watch() {
  const treasury = process.env.TREASURY_PUBKEY;
  if (!treasury) {
    console.error(
      "TREASURY_PUBKEY is required (public address only). Never set a private key."
    );
    process.exit(1);
  }

  let pk;
  try {
    pk = new PublicKey(treasury);
  } catch {
    console.error("TREASURY_PUBKEY must be a public Solana address.");
    process.exit(1);
  }

  if (process.env.DRY_RUN === "1") {
    console.error("DRY_RUN=1 (local tests only). Live matching is DRY_RUN=0.");
  }

  const rpc =
    process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpc, { commitment: "finalized" });
  const pollMs = envNum("POLL_MS", 2000);
  const graceSec = envNum("GRACE_SEC", 600);

  console.error(
    `observe-only watcher treasury=${pk.toBase58()} commitment=finalized (cannot send SOL)`
  );

  for (;;) {
    try {
      await expireOpen(graceSec);
      await pollOnce(connection, pk.toBase58(), graceSec);
    } catch (err) {
      console.error("poll error", err?.message || err);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
