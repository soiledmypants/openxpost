import { DEFAULT_AMOUNT_TOKENS, EXAMPLE_AMOUNT_UI, TOKEN_TICKER } from "../../pay/types";

const PRICE = DEFAULT_AMOUNT_TOKENS.toLocaleString("en-US");

export const HOW_TITLE = "How this is possible";

export const HOW_LEDE =
  `OpenXPost is an open microphone on our X account. You pay a unique ${TOKEN_TICKER} amount near ${PRICE}. We match that exact amount, burn the tokens, then post on @OpenXPost. The tweet link comes back on this site. You are not buying a For You slot.`;

export type HowSection = {
  title: string;
  paragraphs: string[];
};

export const HOW_SECTIONS: HowSection[] = [
  {
    title: `Unique ${TOKEN_TICKER} amount, one treasury`,
    paragraphs: [
      `The price is about ${PRICE} ${TOKEN_TICKER} plus a unique 6-decimal suffix (for example ${EXAMPLE_AMOUNT_UI}). Copy the full string — do not round. Send exactly that amount to the treasury. No wallet connect on this site.`,
      `Pay returns invoiceId, receivePubkey (the treasury), mint, amountUi, and amountRaw. Payment token is ${TOKEN_TICKER}. Exact transfer of amountRaw into the treasury ATA identifies the order.`,
    ],
  },
  {
    title: "Burn",
    paragraphs: [
      `After that unique ${TOKEN_TICKER} amount lands, it is burned. It is not kept. invoice.paid includes amountTokens, mint, and burnSignature.`,
    ],
  },
  {
    title: "Filter",
    paragraphs: [
      "The tweet is text only. The draft is checked before an invoice is issued, and again on the server before posting: no other coins, no contract addresses, no wallets, no shills, no URLs.",
      "One post per payment.",
    ],
  },
  {
    title: "Post on X",
    paragraphs: [
      "After paid, the server re-filters the draft, then posts with the official X API: POST /2/tweets, body { \"text\": \"...\" } only. OAuth 2.0 user context for @OpenXPost. No tokens in the browser.",
      "The status URL is returned on this site as https://x.com/OpenXPost/status/{id}. It is never written into the tweet. If X fails after payment, retry the post. Do not pay again.",
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
