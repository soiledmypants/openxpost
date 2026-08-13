import { isTreasuryConfigured } from "./quote";
import { TREASURY_NOT_SET, type PaymentHit, type Quote } from "./types";

export const DEFAULT_SOLANA_RPC = "https://api.mainnet-beta.solana.com";

type RpcError = { code?: number; message?: string };
type RpcEnvelope<T> = { result?: T; error?: RpcError };

type SignatureInfo = {
  signature: string;
  slot: number;
  err: unknown;
  blockTime: number | null;
};

type ParsedInstruction = {
  program?: string;
  parsed?: {
    type?: string;
    info?: {
      destination?: string;
      lamports?: number | string;
      source?: string;
    };
  };
};

type ParsedTx = {
  slot: number;
  transaction?: {
    message?: {
      instructions?: ParsedInstruction[];
    };
  };
  meta?: {
    innerInstructions?: { instructions?: ParsedInstruction[] }[];
    err: unknown;
  };
};

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`rpc ${response.status}`);
  }
  const body = (await response.json()) as RpcEnvelope<T>;
  if (body.error) {
    throw new Error(body.error.message ?? "rpc error");
  }
  if (body.result === undefined) {
    throw new Error("rpc returned no result");
  }
  return body.result;
}

function collectInstructions(tx: ParsedTx): ParsedInstruction[] {
  const top = tx.transaction?.message?.instructions ?? [];
  const inner =
    tx.meta?.innerInstructions?.flatMap((group) => group.instructions ?? []) ?? [];
  return [...top, ...inner];
}

function transferHit(
  ix: ParsedInstruction,
  treasury: string,
  lamports: bigint,
): boolean {
  if (ix.program !== "system" || ix.parsed?.type !== "transfer") {
    return false;
  }
  const info = ix.parsed.info;
  if (!info || info.destination !== treasury) {
    return false;
  }
  if (info.lamports === undefined) {
    return false;
  }
  return BigInt(info.lamports) === lamports;
}

/**
 * Observe-only: look for a system transfer of the exact quoted lamports
 * to the treasury. Does not connect a wallet or submit transactions.
 */
export async function findPayment(
  quote: Quote,
  options: { rpc?: string; now?: number } = {},
): Promise<PaymentHit | null> {
  const treasury = quote.treasury.trim();
  if (!isTreasuryConfigured(treasury) || treasury === TREASURY_NOT_SET) {
    return null;
  }

  const now = options.now ?? Date.now();
  if (now >= quote.expiresAt) {
    return null;
  }

  const rpcUrl = options.rpc ?? DEFAULT_SOLANA_RPC;
  const sinceSec = Math.floor(quote.createdAt / 1000);

  const signatures = await rpc<SignatureInfo[]>(rpcUrl, "getSignaturesForAddress", [
    treasury,
    { limit: 40 },
  ]);

  for (const info of signatures) {
    if (info.err) continue;
    if (info.blockTime !== null && info.blockTime < sinceSec) continue;

    const tx = await rpc<ParsedTx | null>(rpcUrl, "getTransaction", [
      info.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx || tx.meta?.err) continue;

    const match = collectInstructions(tx).some((ix) =>
      transferHit(ix, treasury, quote.lamports),
    );
    if (match) {
      return { signature: info.signature, slot: info.slot, lamports: quote.lamports };
    }
  }

  return null;
}
