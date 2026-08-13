import { DEFAULT_AMOUNT_TOKENS, TOKEN_TICKER } from "../../pay/types";
import { receivePubkey } from "../config";

const PRICE = DEFAULT_AMOUNT_TOKENS.toLocaleString("en-US");

export const HOW_TITLE = "How this is possible";

export const HOW_LEDE =
  `X open-sourced For You. This account is open too. Zero limits. Use ${TOKEN_TICKER} to post on this X page: links, contract addresses, other coins, ads, slurs, whatever you want. Freedom of speech. Open mic. Powered by Grok. See it in Posts. All official posts from the team will be in the thread of the pinned tweet.`;

export type HowSection = {
  title: string;
  paragraphs: string[];
};

export const HOW_SECTIONS: HowSection[] = [
  {
    title: "Connected wallet, exact amount",
    paragraphs: [
      `Connect Phantom or Solflare. The bound identity is that pubkey plus your draft. When a mint is set, pay is exactly ${PRICE} ${TOKEN_TICKER} (raw 100000 × 10^6 at 6 decimals) to the treasury ${receivePubkey()}. No unique suffix amounts.`,
      `Pay returns invoiceId, orderId, mint, amountTokens (100000), amountRaw, receivePubkey, and fromPubkey. Payment token is ${TOKEN_TICKER}. Mint is VITE_TOKEN_MINT / TOKEN_MINT and is empty unless set. The transfer must come from the connected wallet.`,
    ],
  },
  {
    title: "Treasury",
    paragraphs: [
      `Pay address (public key only): ${receivePubkey()}. The 100,000 $POST stay in that treasury. That is the payment. invoice.paid includes txSig, payer, amountTokens, and mint. No per-pay burn. The server does not ask for or store a private key.`,
    ],
  },
  {
    title: "Open mic",
    paragraphs: [
      `Post anything. Advertise. Drop links, contract addresses, other coins, ads, whatever you want. Zero content limits. Freedom of speech. Open mic. The draft must be non-empty and within the 280-character X text limit. ${TOKEN_TICKER} is the payment token. There is no chat.`,
      "One post per payment.",
    ],
  },
  {
    title: "Post on X",
    paragraphs: [
      "After paid, the server posts with the official X API: POST /2/tweets, body { \"text\": \"...\" } only, using the draft as given — URLs included. OAuth 2.0 user context for @OpenXPost. No tokens in the browser.",
      "The status URL is returned on this site as https://x.com/OpenXPost/status/{id} on the Posts page (/post/), with the 100,000 $POST transfer signature. It is never written into the tweet. If X fails after payment, retry the tweet. Do not pay again.",
    ],
  },
  {
    title: "X open-sourced For You",
    paragraphs: [
      "X open-sourced For You. This account is open too.",
      "Use $POST to post on this X page, including to advertise whatever you want. Links, CAs, other coins, ads — no limits. Freedom of speech. Open mic. Powered by Grok.",
    ],
  },
  {
    title: "This tab is the source",
    paragraphs: [
      "The file tree is this site, bundled at build time. Read Pay and the page itself here. Nothing in this tab sends you somewhere else to see the code.",
    ],
  },
];
