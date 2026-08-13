import { Connection, PublicKey, type ParsedInstruction, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { associatedTokenAddress, tokensToRaw } from "./mint";
import { invoiceIsExpired, isPubkey } from "./invoice";
import type { Invoice, PaymentHit } from "./types";

export const DEFAULT_SOLANA_RPC = "https://api.mainnet-beta.solana.com";

function collectParsed(tx: ParsedTransactionWithMeta): ParsedInstruction[] {
  const top = tx.transaction.message.instructions.filter(
    (ix): ix is ParsedInstruction => "parsed" in ix,
  );
  const inner =
    tx.meta?.innerInstructions?.flatMap((group) =>
      group.instructions.filter((ix): ix is ParsedInstruction => "parsed" in ix),
    ) ?? [];
  return [...top, ...inner];
}

function tokenAmountOf(info: Record<string, unknown>): bigint | null {
  const tokenAmount = info.tokenAmount;
  if (tokenAmount && typeof tokenAmount === "object" && "amount" in tokenAmount) {
    const amount = (tokenAmount as { amount?: unknown }).amount;
    if (typeof amount === "string" || typeof amount === "number") return BigInt(amount);
  }
  if (typeof info.amount === "string" || typeof info.amount === "number") {
    return BigInt(info.amount);
  }
  return null;
}

function isTokenProgram(program?: string): boolean {
  return program === "spl-token" || program === "spl-token-2022";
}

function inboundHit(
  ix: ParsedInstruction,
  destAta: string,
  amountRaw: bigint,
): { fromPubkey: string } | null {
  if (!isTokenProgram(ix.program)) return null;
  const type = ix.parsed && typeof ix.parsed === "object" ? ix.parsed.type : undefined;
  if (type !== "transfer" && type !== "transferChecked") return null;
  const info = ix.parsed && typeof ix.parsed === "object" ? ix.parsed.info : undefined;
  if (!info || typeof info !== "object") return null;
  const rec = info as Record<string, unknown>;
  if (rec.destination !== destAta) return null;
  const amount = tokenAmountOf(rec);
  if (amount === null || amount !== amountRaw) return null;
  const from =
    (typeof rec.authority === "string" && rec.authority) ||
    (typeof rec.multisigAuthority === "string" && rec.multisigAuthority) ||
    "";
  return { fromPubkey: from };
}

function burnHit(
  ix: ParsedInstruction,
  sourceAta: string,
  mint: string,
  amountRaw: bigint,
): boolean {
  if (!isTokenProgram(ix.program)) return false;
  const type = ix.parsed && typeof ix.parsed === "object" ? ix.parsed.type : undefined;
  if (type !== "burn" && type !== "burnChecked") return false;
  const info = ix.parsed && typeof ix.parsed === "object" ? ix.parsed.info : undefined;
  if (!info || typeof info !== "object") return false;
  const rec = info as Record<string, unknown>;
  if (rec.account !== sourceAta) return false;
  if (typeof rec.mint === "string" && rec.mint !== mint) return false;
  const amount = tokenAmountOf(rec);
  return amount !== null && amount === amountRaw;
}

async function parsedTx(
  connection: Connection,
  signature: string,
): Promise<ParsedTransactionWithMeta | null> {
  return connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
}

/**
 * Observe-only: wait for the receive ATA to hold the inbound 10k (raw units
 * from the mint's real decimals). Does not hold keys or submit a burn.
 */
export async function findInboundTokens(
  invoice: Invoice,
  options: { rpc: string; decimals: number; programId: string; now?: number },
): Promise<PaymentHit | null> {
  if (!isPubkey(invoice.receivePubkey) || invoiceIsExpired(invoice, options.now)) {
    return null;
  }

  const amountRaw = tokensToRaw(invoice.amountTokens, options.decimals);
  const ata = associatedTokenAddress(invoice.mint, invoice.receivePubkey, options.programId);
  const connection = new Connection(options.rpc, "confirmed");
  const ataPk = new PublicKey(ata);

  let amount: bigint;
  try {
    const balance = await connection.getTokenAccountBalance(ataPk, "confirmed");
    amount = BigInt(balance.value.amount);
  } catch {
    return null;
  }
  if (amount < amountRaw) return null;

  const sinceSec = Math.floor(invoice.createdAt / 1000);
  const signatures = await connection.getSignaturesForAddress(ataPk, { limit: 40 });

  for (const info of signatures) {
    if (info.err) continue;
    if (info.blockTime != null && info.blockTime < sinceSec) continue;
    const tx = await parsedTx(connection, info.signature);
    if (!tx || tx.meta?.err) continue;
    const match = collectParsed(tx)
      .map((ix) => inboundHit(ix, ata, amountRaw))
      .find((hit) => hit !== undefined && hit !== null);
    if (match) {
      return {
        signature: info.signature,
        fromPubkey: match.fromPubkey,
        amountRaw,
        slot: info.slot,
      };
    }
  }

  const fallback = signatures.find((info) => !info.err);
  if (!fallback) return null;
  return {
    signature: fallback.signature,
    fromPubkey: "",
    amountRaw,
    slot: fallback.slot,
  };
}

/** Real SPL / Token-2022 burn on the receive ATA, if the watcher has already submitted it. */
export async function findBurnSignature(
  invoice: Invoice,
  options: { rpc: string; decimals: number; programId: string },
): Promise<string | null> {
  if (!isPubkey(invoice.receivePubkey)) return null;

  const amountRaw = tokensToRaw(invoice.amountTokens, options.decimals);
  const ata = associatedTokenAddress(invoice.mint, invoice.receivePubkey, options.programId);
  const connection = new Connection(options.rpc, "confirmed");
  const ataPk = new PublicKey(ata);
  const sinceSec = Math.floor(invoice.createdAt / 1000);
  const signatures = await connection.getSignaturesForAddress(ataPk, { limit: 40 });

  for (const info of signatures) {
    if (info.err) continue;
    if (info.blockTime != null && info.blockTime < sinceSec) continue;
    const tx = await parsedTx(connection, info.signature);
    if (!tx || tx.meta?.err) continue;
    const burned = collectParsed(tx).some((ix) =>
      burnHit(ix, ata, invoice.mint, amountRaw),
    );
    if (burned) return info.signature;
  }
  return null;
}
