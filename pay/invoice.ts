import { Keypair } from "@solana/web3.js";
import { DEFAULT_TOKEN_AMOUNT, QUOTE_TTL_MS, type Invoice, type InvoiceSource } from "./types";

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isPubkey(value: string): boolean {
  return PUBKEY_RE.test(value.trim());
}

export function invoiceIsExpired(invoice: Invoice, now = Date.now()): boolean {
  return now >= invoice.expiresAt;
}

export function remainingMs(invoice: Invoice, now = Date.now()): number {
  return Math.max(0, invoice.expiresAt - now);
}

export function canSend(invoice: Invoice): boolean {
  return isPubkey(invoice.receivePubkey);
}

export function formatTokenAmount(amountTokens: number): string {
  return amountTokens.toLocaleString("en-US");
}

function newId(prefix: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

/**
 * Fresh receive pubkey for local/dev UI only. The secret is discarded immediately.
 * The browser must never hold invoice private keys.
 */
export function demoReceivePubkey(): string {
  const kp = Keypair.generate();
  const pub = kp.publicKey.toBase58();
  kp.secretKey.fill(0);
  return pub;
}

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return fallback;
}

function asExpiresAt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return fallback;
}

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function fromPayApi(input: {
  payApi: string;
  mint: string;
  amountTokens: number;
  orderId: string;
  now: number;
  ttlMs: number;
}): Promise<Invoice> {
  const response = await fetch(`${input.payApi}/invoices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderId: input.orderId,
      mint: input.mint,
      amountTokens: input.amountTokens,
    }),
  });
  if (!response.ok) {
    throw new Error(`pay api ${response.status}`);
  }
  const body = (await response.json()) as Record<string, unknown>;
  const receivePubkey = readString(body, "receivePubkey") ?? "";
  if (!isPubkey(receivePubkey)) {
    throw new Error("pay api returned no receivePubkey");
  }
  return {
    invoiceId: readString(body, "invoiceId") ?? newId("inv"),
    orderId: readString(body, "orderId") ?? input.orderId,
    mint: readString(body, "mint") ?? input.mint,
    amountTokens: asPositiveInt(body.amountTokens, input.amountTokens),
    receivePubkey,
    createdAt: input.now,
    expiresAt: asExpiresAt(body.expiresAt, input.now + input.ttlMs),
    source: "api",
  };
}

export type InvoiceStatus = {
  phase?: string;
  signature?: string;
  burnSignature?: string;
  fromPubkey?: string;
  paidAt?: number;
};

export async function fetchInvoiceStatus(
  payApi: string,
  invoiceId: string,
): Promise<InvoiceStatus | null> {
  const response = await fetch(`${payApi}/invoices/${encodeURIComponent(invoiceId)}`);
  if (!response.ok) return null;
  const body = (await response.json()) as Record<string, unknown>;
  const status: InvoiceStatus = {};
  const phase = readString(body, "phase") ?? readString(body, "status");
  const signature = readString(body, "signature");
  const burnSignature = readString(body, "burnSignature");
  const fromPubkey = readString(body, "fromPubkey");
  if (phase) status.phase = phase;
  if (signature) status.signature = signature;
  if (burnSignature) status.burnSignature = burnSignature;
  if (fromPubkey) status.fromPubkey = fromPubkey;
  if (typeof body.paidAt === "number") status.paidAt = body.paidAt;
  return status;
}

/**
 * Create a 100,000-token invoice. receivePubkey comes from VITE_PAY_API when set.
 * With no live API: local/dev gets a labeled demo pubkey; production stays offline.
 * Never invents a funded treasury.
 */
export async function createInvoice(input: {
  mint: string;
  amountTokens?: number;
  orderId?: string;
  payApi?: string | null;
  allowDemo?: boolean;
  now?: number;
  ttlMs?: number;
}): Promise<Invoice> {
  const now = input.now ?? Date.now();
  const ttlMs = input.ttlMs ?? QUOTE_TTL_MS;
  const amountTokens = input.amountTokens ?? DEFAULT_TOKEN_AMOUNT;
  const orderId = input.orderId ?? newId("ord");
  const mint = input.mint.trim();
  if (!isPubkey(mint)) {
    throw new Error("mint is not a public key");
  }
  if (!Number.isInteger(amountTokens) || amountTokens <= 0) {
    throw new Error("amountTokens must be a positive integer");
  }

  const payApi = input.payApi?.trim().replace(/\/$/, "") ?? "";
  if (payApi) {
    return fromPayApi({
      payApi,
      mint,
      amountTokens,
      orderId,
      now,
      ttlMs,
    });
  }

  const source: InvoiceSource = input.allowDemo ? "demo" : "offline";
  return {
    invoiceId: newId("inv"),
    orderId,
    mint,
    amountTokens,
    receivePubkey: source === "demo" ? demoReceivePubkey() : "",
    createdAt: now,
    expiresAt: now + ttlMs,
    source,
  };
}
