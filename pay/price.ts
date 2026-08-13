type CoinGeckoPrice = { solana?: { usd?: number } };
type BinancePrice = { price?: string };

async function fromCoinGecko(): Promise<number> {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
  );
  if (!response.ok) {
    throw new Error(`coingecko ${response.status}`);
  }
  const body = (await response.json()) as CoinGeckoPrice;
  const usd = body.solana?.usd;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
    throw new Error("coingecko returned no SOL price");
  }
  return usd;
}

async function fromBinance(): Promise<number> {
  const response = await fetch(
    "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
  );
  if (!response.ok) {
    throw new Error(`binance ${response.status}`);
  }
  const body = (await response.json()) as BinancePrice;
  const usd = Number(body.price);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error("binance returned no SOL price");
  }
  return usd;
}

/** Public price feeds only. No API keys. Throws if none are reachable. */
export async function fetchSolPriceUsd(): Promise<number> {
  try {
    return await fromCoinGecko();
  } catch {
    return await fromBinance();
  }
}
