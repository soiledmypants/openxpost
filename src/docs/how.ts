import { DEFAULT_AMOUNT_TOKENS, TOKEN_TICKER } from "../../pay/types";

const PRICE = DEFAULT_AMOUNT_TOKENS.toLocaleString("en-US");

export const HOW_TITLE = "How this is possible";

export const HOW_LEDE =
  `OpenXPost is an open microphone on our X account. You connect a wallet and pay ${PRICE} ${TOKEN_TICKER}. Those tokens are burned. We post your text. The tweet link comes back on this site. You are not buying a For You slot.`;

export type HowSection = {
  title: string;
  paragraphs: string[];
};

export const HOW_SECTIONS: HowSection[] = [
  {
    title: `Connect, then pay ${PRICE} ${TOKEN_TICKER}`,
    paragraphs: [
      `Connect Phantom or Solflare. The connected pubkey is the identity. Draft text and that pubkey are bound together — that pair is what gets paid and posted.`,
      `You sign a transfer of exactly ${PRICE} ${TOKEN_TICKER} (100000.000000, raw 100000000000, Token-2022) to the treasury. Payment token is ${TOKEN_TICKER}. Not a unique suffix. Not a rotating invoice wallet.`,
    ],
  },
  {
    title: "Burn",
    paragraphs: [
      `After that ${PRICE} ${TOKEN_TICKER} lands, it is burned. It is not kept. The site shows the tweet next to that burn when posting runs.`,
    ],
  },
  {
    title: "Filter",
    paragraphs: [
      `The tweet is text only. The draft is checked before you pay, and again on the server before posting: no other tickers, no contract addresses, no wallets, no shills, no URLs. ${TOKEN_TICKER} is the payment token.`,
      "One post per payment.",
    ],
  },
  {
    title: "Post on X",
    paragraphs: [
      "After paid, the server re-filters the draft, then posts with the official X API: POST /2/tweets, body { \"text\": \"...\" } only. OAuth 2.0 user context for @OpenXPost. No tokens in the browser.",
      "The status URL is returned on this site as https://x.com/OpenXPost/status/{id}, paired with the burn transaction. It is never written into the tweet. If X fails after payment, retry the post. Do not pay again.",
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
      "The file tree is this site, bundled at build time. Read Pay, the burn, the filter, and the page itself here. Nothing in this tab sends you somewhere else to see the code.",
    ],
  },
];
