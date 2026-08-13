import { DEFAULT_AMOUNT_TOKENS } from "./types";

export const TOKEN_DECIMALS = 6;
export const SUFFIX_MIN = 1;
export const SUFFIX_MAX = 999_999_999;
export const BASE_AMOUNT_RAW = BigInt(DEFAULT_AMOUNT_TOKENS) * 10n ** BigInt(TOKEN_DECIMALS);

/** Unpaid invoices keep their amount. Paid invoices keep it for this grace. */
export const RESERVE_GRACE_MS = 30 * 60 * 1000;

/** Inbound transfer must land in this window after invoice creation. */
export const MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
export const MATCH_SKEW_MS = 2 * 60 * 1000;

const SCALE = 10n ** BigInt(TOKEN_DECIMALS);

/** Always 6 decimal places, e.g. "100482.722913". */
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

export function isAmountUi(value: string): boolean {
  return /^\d+\.\d{6}$/.test(value.trim());
}

export function amountTokensFromRaw(amountRaw: bigint): number {
  return Number(formatAmountUi(amountRaw));
}

export function randomSuffix(): bigint {
  const span = SUFFIX_MAX - SUFFIX_MIN + 1;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const n = buf[0] ?? 0;
  return BigInt((n % span) + SUFFIX_MIN);
}

export function allocateAmountRaw(reserved: ReadonlySet<string>): {
  amountRaw: bigint;
  amountUi: string;
  amountTokens: number;
} {
  for (let i = 0; i < 64; i += 1) {
    const amountRaw = BASE_AMOUNT_RAW + randomSuffix();
    const key = amountRaw.toString();
    if (reserved.has(key)) continue;
    return {
      amountRaw,
      amountUi: formatAmountUi(amountRaw),
      amountTokens: amountTokensFromRaw(amountRaw),
    };
  }
  throw new Error("Could not allocate a unique amount.");
}
