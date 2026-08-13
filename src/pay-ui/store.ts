import type { Invoice, InvoicePaid, MintMeta, PayPhase, PaymentHit } from "../../pay";

export type PaySession = {
  invoice: Invoice;
  draft: string;
  phase: PayPhase;
  payment: PaymentHit | null;
  paid: InvoicePaid | null;
  sendSig: string | null;
  error: string | null;
  mintMeta: MintMeta;
};

export type PayNotice = {
  text: string;
  at: number;
};

type Listener = () => void;

let session: PaySession | null = null;
let notice: PayNotice | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function getPaySession(): PaySession | null {
  return session;
}

export function getPayNotice(): PayNotice | null {
  return notice;
}

export function subscribePay(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function startPaySession(input: {
  invoice: Invoice;
  draft: string;
  mintMeta: MintMeta;
}): void {
  session = {
    invoice: input.invoice,
    draft: input.draft,
    phase: "waiting",
    payment: null,
    paid: null,
    sendSig: null,
    error: null,
    mintMeta: input.mintMeta,
  };
  emit();
}

export function patchPaySession(partial: Partial<PaySession>): void {
  if (!session) return;
  session = { ...session, ...partial };
  emit();
}

export function clearPaySession(): void {
  session = null;
  emit();
}

export function emitPayNotice(text: string): void {
  notice = { text, at: Date.now() };
  emit();
}
