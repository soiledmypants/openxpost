import { DEFAULT_AMOUNT_TOKENS } from "./types";

export const TOKEN_DECIMALS = 6;
export const SUFFIX_MIN = 1;
/** 1..999999999 at 6 dp → e.g. amountTokens "100482.722913", raw 100482722913. */
export const SUFFIX_MAX = 999_999_999;

/** Unpaid invoices keep their amount. Paid invoices keep it for this grace. */
export const RESERVE_GRACE_MS = 30 * 60 * 1000;

/** Inbound transfer must land in this window after invoice creation. */
export const MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
export const MATCH_SKEW_MS = 2 * 60 * 1000;

const SCALE = 10n ** BigInt(TOKEN_DECIMALS);

export function baseAmountRaw(baseTokens = DEFAULT_AMOUNT_TOKENS): bigint {
  if (!Number.isInteger(baseTokens) || baseTokens <= 0) {
    throw new Error("base token amount must be a positive integer");
  }
  return BigInt(baseTokens) * SCALE;
}

/** Always 6 decimal places, e.g. "100482.722913". Do not round. */
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

export function amountUiToRaw(amountUi: string): bigint | null {
  if (!isAmountUi(amountUi)) return null;
  const [whole, frac] = amountUi.trim().split(".");
  return BigInt(whole ?? "0") * SCALE + BigInt(frac ?? "0");
}

export function amountTokensFromUi(amountUi: string): number {
  return Number(amountUi);
}

export function randomSuffix(): bigint {
  const span = BigInt(SUFFIX_MAX - SUFFIX_MIN + 1);
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const n = (BigInt(buf[0] ?? 0) << 32n) | BigInt(buf[1] ?? 0);
  return BigInt(SUFFIX_MIN) + (n % span);
}

export function allocateAmountRaw(
  reserved: ReadonlySet<string>,
  baseTokens = DEFAULT_AMOUNT_TOKENS,
): {
  amountRaw: bigint;
  amountUi: string;
  amountTokens: number;
  suffix: bigint;
} {
  const base = baseAmountRaw(baseTokens);
  for (let i = 0; i < 64; i += 1) {
    const suffix = randomSuffix();
    const amountRaw = base + suffix;
    const key = amountRaw.toString();
    if (reserved.has(key)) continue;
    const amountUi = formatAmountUi(amountRaw);
    return {
      amountRaw,
      amountUi,
      amountTokens: amountTokensFromUi(amountUi),
      suffix,
    };
  }
  throw new Error("Could not allocate a unique amount.");
}
