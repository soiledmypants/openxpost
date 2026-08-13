import {
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { MATCH_SKEW_MS, MATCH_WINDOW_MS } from "./amount";
import { DEFAULT_SOLANA_RPC, isTreasuryConfigured, type PaymentHit } from "./types";

const SIG_PAGE = 100;
const SIG_PAGES = 5;

function connection(rpc: string): Connection {
  return new Connection(rpc, "confirmed");
}

export async function tokenProgramOf(conn: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await conn.getAccountInfo(mint);
  if (info?.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

export async function treasuryAta(
  conn: Connection,
  treasury: string,
  mint: string,
): Promise<PublicKey> {
  const owner = new PublicKey(treasury);
  const mintKey = new PublicKey(mint);
  const programId = await tokenProgramOf(conn, mintKey);
  return getAssociatedTokenAddress(mintKey, owner, false, programId);
}

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

function isSplTokenParsed(ix: ParsedInstruction): boolean {
  const program = typeof ix.program === "string" ? ix.program : "";
  if (!program) return true;
  return program === "spl-token" || program === "spl-token-2022";
}

function parsedAmount(info: Record<string, unknown>): bigint {
  const tokenAmount = info.tokenAmount as { amount?: string } | undefined;
  return BigInt(String(tokenAmount?.amount ?? info.amount ?? "0"));
}

function parsedPayer(info: Record<string, unknown>): string {
  const authority = String(info.authority ?? "").trim();
  const multisig = String(info.multisigAuthority ?? "").trim();
  return authority || multisig;
}

export function readTransfer(
  tx: ParsedTransactionWithMeta,
  mint: string,
  destAta: string,
  rawAmount: bigint,
): { payer: string } | null {
  for (const ix of collectParsed(tx)) {
    if (!isSplTokenParsed(ix)) continue;
    const parsed = ix.parsed;
    if (!parsed || typeof parsed !== "object") continue;
    const type = (parsed as { type?: string }).type;
    if (type !== "transferChecked" && type !== "transfer") continue;
    const info = (parsed as { info?: Record<string, unknown> }).info;
    if (!info) continue;
    const destination = String(info.destination ?? "");
    const mintIx = String(info.mint ?? mint);
    const amount = parsedAmount(info);
    const payer = parsedPayer(info);
    if (destination === destAta && mintIx === mint && amount === rawAmount && payer) {
      return { payer };
    }
  }
  return null;
}

export function readBurn(
  tx: ParsedTransactionWithMeta,
  mint: string,
  ata: string,
  rawAmount: bigint,
): boolean {
  for (const ix of collectParsed(tx)) {
    if (!isSplTokenParsed(ix)) continue;
    const parsed = ix.parsed;
    if (!parsed || typeof parsed !== "object") continue;
    const type = (parsed as { type?: string }).type;
    if (type !== "burn" && type !== "burnChecked") continue;
    const info = (parsed as { info?: Record<string, unknown> }).info;
    if (!info) continue;
    const account = String(info.account ?? info.source ?? "");
    const mintIx = String(info.mint ?? mint);
    const amount = parsedAmount(info);
    if (account === ata && mintIx === mint && amount === rawAmount) return true;
  }
  return false;
}

export function inMatchWindow(blockTimeMs: number, createdAt: number, now: number): boolean {
  const start = createdAt - MATCH_SKEW_MS;
  const end = Math.min(now, createdAt + MATCH_WINDOW_MS);
  return blockTimeMs >= start && blockTimeMs <= end;
}

export type MatchedTransfer = {
  signature: string;
  payer: string;
  slot: number;
  blockTimeMs: number;
  amountRaw: bigint;
};

/**
 * Observe-only: look for an SPL / Token-2022 transfer of the exact raw amount
 * into the treasury ATA. Does not connect a wallet or hold secrets.
 */
export async function findPayments(input: {
  treasury: string;
  mint: string;
  amountRaw: bigint;
  createdAt: number;
  rpc?: string;
  now?: number;
}): Promise<MatchedTransfer[]> {
  const treasury = input.treasury.trim();
  if (!isTreasuryConfigured(treasury)) return [];

  const rpcUrl = input.rpc ?? DEFAULT_SOLANA_RPC;
  const now = input.now ?? Date.now();
  const conn = connection(rpcUrl);
  const ata = await treasuryAta(conn, treasury, input.mint);
  const destAta = ata.toBase58();
  const found: MatchedTransfer[] = [];
  let before: string | undefined;

  for (let page = 0; page < SIG_PAGES; page += 1) {
    const sigs = await conn.getSignaturesForAddress(ata, {
      limit: SIG_PAGE,
      ...(before ? { before } : {}),
    });
    if (sigs.length === 0) break;
    for (const info of sigs) {
      if (info.err) continue;
      const blockTimeMs = (info.blockTime ?? 0) * 1000;
      if (blockTimeMs && !inMatchWindow(blockTimeMs, input.createdAt, now)) continue;
      const tx = await conn.getParsedTransaction(info.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) continue;
      const hit = readTransfer(tx, input.mint, destAta, input.amountRaw);
      if (!hit) continue;
      found.push({
        signature: info.signature,
        payer: hit.payer,
        slot: tx.slot,
        blockTimeMs: blockTimeMs || (tx.blockTime ? tx.blockTime * 1000 : input.createdAt),
        amountRaw: input.amountRaw,
      });
    }
    const last = sigs[sigs.length - 1];
    if (!last || sigs.length < SIG_PAGE) break;
    before = last.signature;
  }

  found.reverse();
  return found;
}

export async function findPayment(input: {
  treasury: string;
  mint: string;
  amountRaw: bigint;
  createdAt: number;
  rpc?: string;
  now?: number;
  usedSignatures?: ReadonlySet<string>;
}): Promise<PaymentHit | null> {
  const matches = await findPayments(input);
  const unused = input.usedSignatures
    ? matches.filter((row) => !input.usedSignatures?.has(row.signature))
    : matches;
  const hit = unused[0];
  if (!hit) return null;
  return {
    signature: hit.signature,
    slot: hit.slot,
    payer: hit.payer,
    amountRaw: hit.amountRaw,
  };
}
