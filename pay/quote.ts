import {
  LAMPORTS_PER_SOL,
  QUOTE_TTL_MS,
  SUFFIX_MAX,
  SUFFIX_MIN,
  TARGET_USD,
  TREASURY_NOT_SET,
  type Quote,
} from "./types";

export function formatAmountSol(lamports: bigint): string {
  const negative = lamports < 0n;
  const value = negative ? -lamports : lamports;
  const whole = value / LAMPORTS_PER_SOL;
  const frac = value % LAMPORTS_PER_SOL;
  const sign = negative ? "-" : "";
  return `${sign}${whole.toString()}.${frac.toString().padStart(9, "0")}`;
}

export function parseAmountSol(amountSol: string): bigint {
  const match = /^(-?)(\d+)\.(\d{9})$/.exec(amountSol.trim());
  if (!match) {
    throw new Error("amountSol must be a 9-decimal SOL string");
  }
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2] ?? "0");
  const frac = BigInt(match[3] ?? "0");
  return sign * (whole * LAMPORTS_PER_SOL + frac);
}

/** Convert USD to lamports from a SOL/USD price. Integer math after scaling. */
export function usdToLamports(usd: number, solPriceUsd: number): bigint {
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error("usd must be a positive finite number");
  }
  if (!Number.isFinite(solPriceUsd) || solPriceUsd <= 0) {
    throw new Error("solPriceUsd must be a positive finite number");
  }
  const lamports = Math.round((usd / solPriceUsd) * Number(LAMPORTS_PER_SOL));
  if (!Number.isFinite(lamports) || lamports <= 0) {
    throw new Error("lamport conversion out of range");
  }
  return BigInt(lamports);
}

export function randomSuffix(random = defaultRandom): number {
  const span = SUFFIX_MAX - SUFFIX_MIN + 1;
  return SUFFIX_MIN + Math.floor(random() * span);
}

function defaultRandom(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] ?? 0) / 2 ** 32;
  }
  return Math.random();
}

export function isTreasuryConfigured(treasury: string): boolean {
  const value = treasury.trim();
  if (!value || value === TREASURY_NOT_SET) {
    return false;
  }
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export function createQuote(input: {
  solPriceUsd: number;
  treasury?: string;
  suffix?: number;
  now?: number;
  targetUsd?: number;
}): Quote {
  const now = input.now ?? Date.now();
  const targetUsd = input.targetUsd ?? TARGET_USD;
  const suffix = input.suffix ?? randomSuffix();
  if (!Number.isInteger(suffix) || suffix < SUFFIX_MIN || suffix > SUFFIX_MAX) {
    throw new Error(`suffix must be an integer ${SUFFIX_MIN}–${SUFFIX_MAX}`);
  }

  const base = usdToLamports(targetUsd, input.solPriceUsd);
  const lamports = base + BigInt(suffix);
  const treasury = (input.treasury ?? TREASURY_NOT_SET).trim() || TREASURY_NOT_SET;

  return {
    lamports,
    amountSol: formatAmountSol(lamports),
    suffix,
    treasury,
    createdAt: now,
    expiresAt: now + QUOTE_TTL_MS,
    targetUsd,
    solPriceUsd: input.solPriceUsd,
  };
}

export function quoteIsExpired(quote: Quote, now = Date.now()): boolean {
  return now >= quote.expiresAt;
}

export function remainingMs(quote: Quote, now = Date.now()): number {
  return Math.max(0, quote.expiresAt - now);
}
