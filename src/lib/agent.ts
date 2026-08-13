import { checkDraft, MAX_CHARS } from "./rules";

export type ChatRole = "agent" | "you";

export type ChatMessage = {
  role: ChatRole;
  text: string;
};

export const GREETING =
  "Draft the post. I check the rules. I do not post. Payment is 100,000 tokens, sent from your wallet to a fresh receive address, then burned. The tweet link comes back on this site, never in the tweet.";

export function reviewDraft(draft: string): string {
  const hits = checkDraft(draft);
  if (hits.length === 1 && hits[0]?.id === "empty") {
    return hits[0].message;
  }
  if (hits.length > 0) {
    return hits.map((hit) => hit.message).join(" ");
  }
  const remaining = MAX_CHARS - draft.trim().length;
  return `This can go up. ${remaining} characters left. Get a quote — 100,000 tokens, then burned. One post per payment.`;
}

export function answer(question: string, draft: string): string {
  const q = question.trim().toLowerCase();
  if (!q) {
    return reviewDraft(draft);
  }
  if (/(how|what).*(pay|token|amount|invoice|burn)/.test(q) || q.includes("wallet")) {
    return "Connect a wallet. Send exactly 100,000 tokens to the invoice receive address. We look up the mint decimals — do not assume 6 or 9. Those tokens are burned. Supply goes down.";
  }
  if (/(for you|foryou|algorithm|boost)/.test(q)) {
    return "This is not a For You slot. You are not buying distribution. You are posting on the OpenXPost X account, @OpenXPost.";
  }
  if (/(rule|allow|cannot|can't|url|ca|shill|coin)/.test(q)) {
    return "No other coins, CAs, wallets, or shills. No URLs in the tweet. The CA on this page is ours — do not paste it into the post. One post per payment.";
  }
  if (/(link|status|tweet url|where)/.test(q)) {
    return "If it posts, the status link is returned here. It is never written into the tweet. Follow @OpenXPost.";
  }
  if (/(treasury|address|where.*send|receive)/.test(q)) {
    return "Each invoice has a fresh receive address. There is no treasury destination. If you see that the pay watcher is not connected, do not send tokens.";
  }
  if (/(time|expire|timer|minute)/.test(q)) {
    return "Invoices last 15 minutes. After that, get a new one. Do not send to the old receive address.";
  }
  if (/(openxpost|account|handle|follow)/.test(q)) {
    return "The live account is @OpenXPost.";
  }
  return reviewDraft(draft);
}
