import { DEFAULT_AMOUNT_TOKENS, DEFAULT_RECEIVE_PUBKEY, TOKEN_TICKER } from "../../pay/types";

const PRICE = DEFAULT_AMOUNT_TOKENS.toLocaleString("en-US");

export const HOW_TITLE = "How this is possible";

export const HOW_LEDE =
  `OpenXPost is an open microphone on our X account. You connect a wallet, write a draft, and pay ${PRICE} ${TOKEN_TICKER} to the treasury. We post your text. See it in Posts. All official posts from the team will be in the thread of the pinned tweet. You are not buying a For You slot.`;

export type HowSection = {
  title: string;
  paragraphs: string[];
};

export const HOW_SECTIONS: HowSection[] = [
  {
    title: "Connected wallet, exact amount",
    paragraphs: [
      `Connect Phantom or Solflare. The bound identity is that pubkey plus your draft. Pay is exactly ${PRICE} ${TOKEN_TICKER} (raw 100000 × 10^6 at 6 decimals) to the treasury ${DEFAULT_RECEIVE_PUBKEY}. No unique suffix amounts.`,
      `Pay returns invoiceId, orderId, mint, amountTokens (100000), amountRaw, receivePubkey, and fromPubkey. Payment token is ${TOKEN_TICKER}. The transfer must come from the connected wallet.`,
    ],
  },
  {
    title: "Treasury",
    paragraphs: [
      `Pay address (public key only): ${DEFAULT_RECEIVE_PUBKEY}. The 100,000 $POST stay in that treasury. That is the payment. invoice.paid includes txSig, payer, amountTokens, and mint. No per-pay burn. The server does not ask for or store a private key.`,
    ],
  },
  {
    title: "Filter",
    paragraphs: [
      `The tweet is text only. The draft is checked as you type, and again on the server before posting: no other tickers, no contract addresses, no wallets, no shills, no URLs, no bundled FUD or attacks on the coin or dev. Swearing is fine. ${TOKEN_TICKER} is the payment token. There is no chat.`,
      "One post per payment.",
    ],
  },
  {
    title: "Post on X",
    paragraphs: [
      "After paid, the server re-filters the draft, then posts with the official X API: POST /2/tweets, body { \"text\": \"...\" } only. OAuth 2.0 user context for @OpenXPost. No tokens in the browser.",
      "The status URL is returned on this site as https://x.com/OpenXPost/status/{id} on the Posts page (/post/), with the 100,000 $POST transfer signature. It is never written into the tweet. If X fails after payment, retry the tweet. Do not pay again.",
    ],
  },
  {
    title: "For You is the narrative, not the product",
    paragraphs: [
      "X open-sourced For You. That is the sentence this product answers. The ranking code being public does not mean anyone can inject a post into the feed.",
      "OpenXPost does not buy distribution. It does not touch For You. You pay to speak on our account. That is the whole product.",
    ],
  },
  {
    title: "This tab is the source",
    paragraphs: [
      "The file tree is this site, bundled at build time. Read Pay, the filter, and the page itself here. Nothing in this tab sends you somewhere else to see the code.",
    ],
  },
];
