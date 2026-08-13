export const HOW_TITLE = "How this is possible";

export const HOW_LEDE =
  "OpenXPost is an open microphone on our X account. You pay about $1 in SOL. We post your text. The tweet link comes back on this site. You are not buying a For You slot.";

export type HowSection = {
  title: string;
  paragraphs: string[];
};

export const HOW_SECTIONS: HowSection[] = [
  {
    title: "Unique lamports, no wallet connect",
    paragraphs: [
      "We do not connect a wallet. We do not ask anyone to sign a transaction in the browser.",
      "A quote starts at about $1 of SOL, converted to lamports, then adds a random suffix from 1 to 9999. The amount is shown to nine decimal places. That exact number is the invoice.",
      "When you send that exact amount, we know which draft it belongs to. Rounding breaks the match. Copy the amount as shown.",
    ],
  },
  {
    title: "Watch the treasury",
    paragraphs: [
      "A watcher looks at the treasury address on Solana. It does not send. It does not connect a wallet.",
      "It matches a SystemProgram.transfer of the quoted lamports to the treasury. If that transfer appears before the quote expires (15 minutes), the payment is identified.",
      "If the treasury is TREASURY_NOT_SET, do not send funds. Watching is off.",
    ],
  },
  {
    title: "Filter",
    paragraphs: [
      "The tweet is text only. The draft is checked before a quote is issued: no other coins, no contract addresses, no wallets, no shills, no URLs.",
      "One post per payment.",
    ],
  },
  {
    title: "Post on X",
    paragraphs: [
      "After a match, we post with the official X API: POST /2/tweets, text only. No cards. No attachments. No link in the tweet.",
      "The status URL is returned on this site. It is never written into the tweet.",
    ],
  },
  {
    title: "For You is the narrative, not the product",
    paragraphs: [
      "X open-sourced For You. That is the sentence this product answers. The ranking code being public does not mean anyone can inject a post into the feed.",
      "OpenXPost does not buy distribution. It does not touch For You. It does not place you in anyone else’s timeline by force. You pay to speak on our account. That is the whole product.",
    ],
  },
  {
    title: "This tab is the source",
    paragraphs: [
      "The file tree is this site, bundled at build time. Read the pay quotes, the watcher, the filter, and the page itself here. Nothing in this tab sends you somewhere else to see the code.",
    ],
  },
];
