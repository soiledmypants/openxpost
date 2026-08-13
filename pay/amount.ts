import { DEFAULT_AMOUNT_TOKENS } from "./types";

export const TOKEN_DECIMALS = 6;
export const BASE_AMOUNT_RAW = BigInt(DEFAULT_AMOUNT_TOKENS) * 10n ** BigInt(TOKEN_DECIMALS);

/** Inbound transfer must land in this window after invoice creation. */
export const MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
export const MATCH_SKEW_MS = 2 * 60 * 1000;

const SCALE = 10n ** BigInt(TOKEN_DECIMALS);

export function formatAmountUi(amountRaw: bigint): string {
  const whole = amountRaw / SCALE;
  const frac = amountRaw % SCALE;
  return `${whole.toString()}.${frac.toString().padStart(TOKEN_DECIMALS, "0")}`;
}

export function parseAmountRaw(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

export function amountTokensFromRaw(amountRaw: bigint): number {
  return Number(amountRaw / SCALE);
}

/** Coerce stored invoice amounts (number or string) to a finite number. */
export function amountTokensNumber(value: number | string | undefined, amountRaw?: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  const raw = amountRaw ? parseAmountRaw(amountRaw) : null;
  if (raw != null) return amountTokensFromRaw(raw);
  return NaN;
}

export function exactAmountRaw(): bigint {
  return BASE_AMOUNT_RAW;
}
