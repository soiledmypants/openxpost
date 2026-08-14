import type { PostedPair } from "../pay/types";
import { solscanTxUrl } from "../pay/types";

function displayUrl(url: string): string {
  return url.replace(/^https:\/\//, "");
}

function shortenSig(sig: string): string {
  if (sig.length <= 16) return sig;
  return `${sig.slice(0, 8)}…${sig.slice(-8)}`;
}

function linkEl(href: string, label: string, title?: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "pair-link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  if (title) link.title = title;
  return link;
}

function proofLink(kind: string, href: string, label: string, title?: string): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "posts-proof";
  const tag = document.createElement("span");
  tag.className = "posts-proof-k";
  tag.textContent = kind;
  wrap.append(tag, linkEl(href, label, title));
  return wrap;
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
    empty.append("No posts yet. ");
    const write = document.createElement("a");
    write.href = "/#post";
    write.textContent = "Write a post";
    empty.append(write, ".");
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
    links.append(proofLink("X", item.tweetUrl, displayUrl(item.tweetUrl), item.tweetUrl));
    const txHref = solscanTxUrl(item.txSig);
    links.append(proofLink("tx", txHref, `solscan.io/tx/${shortenSig(item.txSig)}`, item.txSig));
    row.append(links);
    list.append(row);
  }
}
