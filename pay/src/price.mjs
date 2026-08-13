const WSOL = "So11111111111111111111111111111111111111112";
const JUP = `https://api.jup.ag/price/v3?ids=${WSOL}`;
const CG =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

async function jupiterUsd() {
  const res = await fetch(JUP);
  if (!res.ok) throw new Error(`jupiter ${res.status}`);
  const data = await res.json();
  const usd = Number(data?.[WSOL]?.usdPrice);
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("jupiter usdPrice");
  return usd;
}

async function coingeckoUsd() {
  const res = await fetch(CG);
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const data = await res.json();
  const usd = Number(data?.solana?.usd);
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("coingecko usd");
  return usd;
}

export async function solUsd() {
  try {
    return await jupiterUsd();
  } catch {
    return await coingeckoUsd();
  }
}

/** 10_000-lamport bucket for AMOUNT_USD of SOL at solUsd. */
export function bucketLamports(solUsdPrice, amountUsd = 1, suffixMod = 10000) {
  const raw = Math.floor((amountUsd * 1e9) / solUsdPrice);
  return Math.floor(raw / suffixMod) * suffixMod;
}
