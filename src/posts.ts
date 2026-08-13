import type { PostedPair } from "../pay/types";
import { solscanTxUrl } from "../pay/types";

function displayUrl(url: string): string {
  return url.replace(/^https:\/\//, "");
}

function shortenSig(sig: string): string {
  if (sig.length <= 16) return sig;
  return `${sig.slice(0, 8)}…${sig.slice(-8)}`;
}

function linkEl(href: string, label: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "pair-link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

export function renderPostedRows(
  list: HTMLElement,
  count: HTMLElement | null,
  posted: PostedPair[],
): void {
  if (count) {
    count.textContent = posted.length === 1 ? "1 post" : `${posted.length} posts`;
  }
  list.replaceChildren();
  if (posted.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No posts yet. Use $POST to post on this X page.";
    list.append(empty);
    return;
  }
  for (const item of posted) {
    const row = document.createElement("article");
    row.className = "posts-row";

    const text = document.createElement("p");
    text.className = "posts-text";
    text.textContent = item.tweetText || item.tweetUrl;
    row.append(text);

    const links = document.createElement("div");
    links.className = "posts-meta";
    links.append(linkEl(item.tweetUrl, displayUrl(item.tweetUrl)));
    const txHref = solscanTxUrl(item.txSig);
    links.append(linkEl(txHref, shortenSig(item.txSig)));
    row.append(links);
    list.append(row);
  }
}
