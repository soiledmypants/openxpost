import { checkDraft, MAX_CHARS } from "./rules";

export type ChatRole = "agent" | "you";

export type ChatMessage = {
  role: ChatRole;
  text: string;
};

export const GREETING =
  "Draft the post. I check the rules. I do not post. Payment is a unique SOL amount — no wallet connect. The tweet link comes back on this site, never in the tweet.";

export function reviewDraft(draft: string): string {
  const hits = checkDraft(draft);
  if (hits.length === 1 && hits[0]?.id === "empty") {
    return hits[0].message;
  }
  if (hits.length > 0) {
    return hits.map((hit) => hit.message).join(" ");
  }
  const remaining = MAX_CHARS - draft.trim().length;
  return `This can go up. ${remaining} characters left. Get a quote — one post per payment.`;
}

export function answer(question: string, draft: string): string {
  const q = question.trim().toLowerCase();
  if (!q) {
    return reviewDraft(draft);
  }
  if (/(how|what).*(pay|sol|amount|invoice)/.test(q) || q.includes("wallet")) {
    return "Send the exact quoted lamports to the treasury. Nine decimals. The 1–9999 suffix is the invoice. No wallet connect. Do not round.";
  }
  if (/(for you|foryou|algorithm|boost)/.test(q)) {
    return "This is not a For You slot. You are not buying distribution. You are posting on the OpenXPost X account.";
  }
  if (/(rule|allow|cannot|can't|url|ca|shill|coin)/.test(q)) {
    return "No other coins, CAs, wallets, or shills. No URLs in the tweet. One post per payment.";
  }
  if (/(link|status|tweet url|where)/.test(q)) {
    return "If it posts, the status link is returned here. It is never written into the tweet.";
  }
  if (/(treasury|address|where.*send)/.test(q)) {
    return "The receiving address is shown on the quote. If you see TREASURY_NOT_SET, do not send funds.";
  }
  if (/(time|expire|timer|minute)/.test(q)) {
    return "Quotes last 15 minutes. After that, get a new unique amount.";
  }
  return reviewDraft(draft);
}
