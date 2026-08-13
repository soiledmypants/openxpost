import { amountTokens } from "../config";
import { checkDraft, MAX_CHARS } from "./rules";

function price(): string {
  return amountTokens().toLocaleString("en-US");
}

export type ChatRole = "agent" | "you";

export type ChatMessage = {
  role: ChatRole;
  text: string;
};

export const GREETING =
  `Draft the post. I check the rules. Connect Phantom or Solflare and sign exactly ${price()} tokens. Those tokens are burned after they land. The tweet link comes back on this site, never in the tweet.`;

export function reviewDraft(draft: string): string {
  const hits = checkDraft(draft);
  if (hits.length === 1 && hits[0]?.id === "empty") {
    return hits[0].message;
  }
  if (hits.length > 0) {
    return hits.map((hit) => hit.message).join(" ");
  }
  const remaining = MAX_CHARS - draft.trim().length;
  return `This can go up. ${remaining} characters left. Pay ${price()} tokens — they will be burned.`;
}

export function answer(question: string, draft: string): string {
  const q = question.trim().toLowerCase();
  if (!q) {
    return reviewDraft(draft);
  }
  if (/(how|what).*(pay|token|amount|invoice)/.test(q) || q.includes("wallet")) {
    return `Connect Phantom or Solflare. Sign a transfer of exactly ${price()} tokens to the invoice receive address. Those tokens are burned after they land.`;
  }
  if (/(burn|flywheel)/.test(q)) {
    return `After the ${price()} tokens land, Pay burns them. They are not kept. That is the flywheel.`;
  }
  if (/(for you|foryou|algorithm|boost)/.test(q)) {
    return "This is not a For You slot. You are not buying distribution. You are posting on the OpenXPost X account.";
  }
  if (/(rule|allow|cannot|can't|url|ca|shill|coin)/.test(q)) {
    return "No other coins, CAs, wallets, or shills in the tweet. No URLs in the tweet. One post per payment.";
  }
  if (/(link|status|tweet url|where)/.test(q)) {
    return "If it posts, the status link is returned here. It is never written into the tweet.";
  }
  return reviewDraft(draft);
}
