export type RuleId = "empty" | "length" | "url" | "ca" | "wallet" | "coin" | "shill";

export type RuleHit = {
  id: RuleId;
  message: string;
};

const URL_RE =
  /\b(https?:\/\/|www\.|t\.co\/)[^\s]+|\b[a-z0-9-]+\.(com|io|xyz|org|net|app|ai|dev|gg|link|me)\b/i;
const ETH_CA_RE = /\b0x[a-fA-F0-9]{40}\b/;
const SOL_CA_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const TICKER_RE = /(^|\s)\$[A-Za-z]{2,12}\b/;
const WALLET_RE =
  /\b(wallet|airdrop|seed phrase|private key|send (sol|eth|btc) to|my address)\b/i;
const SHILL_RE =
  /\b(shill|100x|1000x|guaranteed|buy now|contract address|\bca:)\b/i;

export const MAX_CHARS = 280;

export function checkDraft(text: string): RuleHit[] {
  const hits: RuleHit[] = [];
  const trimmed = text.trim();

  if (!trimmed) {
    hits.push({ id: "empty", message: "Write the post first." });
    return hits;
  }

  if (trimmed.length > MAX_CHARS) {
    hits.push({ id: "length", message: `Keep it to ${MAX_CHARS} characters.` });
  }

  if (URL_RE.test(trimmed)) {
    hits.push({ id: "url", message: "No URLs in the tweet." });
  }

  if (ETH_CA_RE.test(trimmed) || SOL_CA_RE.test(trimmed)) {
    hits.push({ id: "ca", message: "No contract addresses." });
  }

  if (WALLET_RE.test(trimmed)) {
    hits.push({ id: "wallet", message: "No wallets." });
  }

  if (TICKER_RE.test(trimmed)) {
    hits.push({ id: "coin", message: "No other coins." });
  }

  if (SHILL_RE.test(trimmed)) {
    hits.push({ id: "shill", message: "No shills." });
  }

  return hits;
}

export function isDraftClean(text: string): boolean {
  return checkDraft(text).length === 0;
}
