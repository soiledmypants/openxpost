export const HOW_TITLE = "How this is possible";

export const HOW_LEDE =
  "OpenXPost is an open microphone on our X account, @OpenXPost. You send 100,000 tokens. Those tokens are burned. We post your text. The tweet link comes back on this site. You are not buying a For You slot.";

export type HowSection = {
  title: string;
  paragraphs: string[];
};

export const HOW_SECTIONS: HowSection[] = [
  {
    title: "100,000 tokens, then burn",
    paragraphs: [
      "Price is exactly 100,000 tokens. The test mint is Token-2022 with 6 decimals, so that is 100,000,000,000 raw units. We still look up decimals on chain and do not assume 6 or 9.",
      "You connect a wallet (Phantom, Solflare, or a wallet-standard wallet) and sign a transfer of exactly 100,000 tokens to a fresh per-order receive address.",
      "Those tokens are then burned — a real SPL or Token-2022 burn. Supply goes down. The browser never holds the invoice private key. The receive pubkey comes from the pay API (VITE_PAY_API). If that watcher is not connected, the site says so and does not invent a funded treasury.",
    ],
  },
  {
    title: "Watch the receive ATA",
    paragraphs: [
      "After you send, we poll the receive associated token account for the inbound 100,000. The UI moves waiting → paid → burning → done.",
      "A later watcher can emit invoice.paid: invoiceId, orderId, amountTokens, mint, fromPubkey, signature, burnSignature, paidAt, postText, postTextHash.",
      "If you see “pay watcher not connected,” do not send tokens you cannot lose. Demo receive addresses exist only in local/dev, and they are labeled.",
    ],
  },
  {
    title: "Filter",
    paragraphs: [
      "The tweet is text only. The draft is checked before an invoice is issued: no other coins, no contract addresses, no wallets, no shills, no URLs. The CA on this site is ours. Do not put it in the tweet.",
      "One post per 100,000-token payment.",
    ],
  },
  {
    title: "Post on X",
    paragraphs: [
      "After a match, we post with the official X API: POST /2/tweets, text only. No cards. No attachments. No link in the tweet. Posting is still mocked in this build until that API is wired.",
      "The status URL is returned on this site. It is never written into the tweet. The account is @OpenXPost.",
    ],
  },
  {
    title: "For You is the narrative, not the product",
    paragraphs: [
      "X open-sourced For You. That is the sentence this product answers. The ranking code being public does not mean anyone can inject a post into the feed.",
      "OpenXPost does not buy distribution. It does not touch For You. It does not place you in anyone else’s timeline by force. You pay 100,000 tokens to speak on our account. Those tokens are burned. That is the whole product.",
    ],
  },
  {
    title: "This tab is the source",
    paragraphs: [
      "The file tree is this site, bundled at build time. Read the invoices, the ATA watcher, the filter, and the page itself here. Nothing in this tab sends you somewhere else to see the code.",
    ],
  },
];
