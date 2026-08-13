/**
 * Draft filter. Blocks other tickers (except $POST), CAs, wallets, URLs,
 * shills, bundled/bundler FUD, coin-is-ass / rug / honeypot attacks, and
 * insults aimed at the dev.
 *
 * Hate-speech vocabulary is allowed. There is no slur denylist. A draft
 * that only uses slurs or other rude language is clean unless it also
 * matches one of the attack / promo patterns below.
 */
export type RuleId = "empty" | "length" | "url" | "ca" | "wallet" | "coin" | "shill" | "abuse";

export type RuleHit = {
  id: RuleId;
  message: string;
};

const URL_RE =
  /\b(https?:\/\/|www\.|t\.co\/)[^\s]+|\b[a-z0-9-]+\.(com|io|xyz|org|net|app|ai|dev|gg|link|me)\b/i;
const ETH_CA_RE = /\b0x[a-fA-F0-9]{40}\b/;
const SOL_CA_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const TICKER_RE = /(^|\s)\$([A-Za-z]{2,12})\b/gi;
const WALLET_RE =
  /\b(wallet|airdrop|seed phrase|private key|send (sol|eth|btc) to|my address)\b/i;
const SHILL_RE =
  /\b(shill|100x|1000x|guaranteed|buy now|contract address|\bca:)\b/i;

/** Whole-word bundled / bundler FUD. Does not match "bundle" alone. */
const BUNDLED_RE = /\bbundl(?:ed|ers?)\b/i;

/**
 * Coin FUD: rugs / honeypots, plus "coin is ass" / "this coin is ass" / "coin ass".
 * Bare "ass", "that's ass", and other swearing do not match.
 */
const COIN_ATTACK_RE =
  /\b(?:rugpulls?|rugged|rug\s+pulls?|rugs?|honeypots?|(?:(?:the|this|that)\s+)?coins?(?:['\u2019]s)?\s+(?:(?:is|are)\s+(?:(?:so|pretty|really|complete(?:ly)?|total(?:ly)?|absolute(?:ly)?)\s+)*)?ass)\b/i;

const DEV_INSULT =
  String.raw`(?:retarded|retards?|idiots?|idiotic|stupid|dumb(?:ass)?|morons?|gay|trash|garbage|ass|clowns?|faggots?|sucks?|shitty?)`;

/**
 * Insults aimed at the dev. Standalone swearing, slurs, "this is retarded",
 * and "that's ass" pass. Only the dev-targeted patterns below fail.
 */
const DEV_ATTACK_RE = new RegExp(
  [
    String.raw`\b(?:fuck|fucking|hate|screw)\s+(?:(?:the|this|that)\s+)?dev(?:eloper)?s?\b`,
    String.raw`\b(?:(?:the|this|that)\s+)?(?:${DEV_INSULT})\s+dev(?:eloper)?s?\b`,
    String.raw`\b(?:(?:the|this|that)\s+)?dev(?:eloper)?s?(?:['\u2019]s|\s+is|\s+are)(?:\s+an?)?(?:\s+(?:fucking|goddamn|absolute|total|complete|real))?\s+${DEV_INSULT}\b`,
    String.raw`\b(?:(?:the|this|that)\s+)?dev(?:eloper)?s?\s+${DEV_INSULT}\b`,
  ].join("|"),
  "i",
);

export const MAX_CHARS = 280;

const PAYMENT_TICKER = "POST";

function hasOtherTicker(text: string): boolean {
  for (const match of text.matchAll(TICKER_RE)) {
    const ticker = match[2];
    if (ticker && ticker.toUpperCase() !== PAYMENT_TICKER) return true;
  }
  return false;
}

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

  if (hasOtherTicker(trimmed)) {
    hits.push({ id: "coin", message: "No other tickers." });
  }

  if (SHILL_RE.test(trimmed)) {
    hits.push({ id: "shill", message: "No shills." });
  }

  if (BUNDLED_RE.test(trimmed)) {
    hits.push({ id: "abuse", message: "No bundled FUD." });
  }

  if (COIN_ATTACK_RE.test(trimmed)) {
    hits.push({ id: "abuse", message: "No attacks on the coin." });
  }

  if (DEV_ATTACK_RE.test(trimmed)) {
    hits.push({ id: "abuse", message: "No attacks on the dev." });
  }

  return hits;
}

export function isDraftClean(text: string): boolean {
  return checkDraft(text).length === 0;
}
