import { createInvoice, loadBoard, newOrderId, postTextHash } from "../pay";
import type { PostedPair } from "../pay/types";
import { solscanTxUrl } from "../pay/types";
import { receivePubkey as defaultReceive, TOKEN_TICKER } from "./config";
import { $, copyText } from "./lib/dom";
import { checkDraft, isDraftClean, MAX_CHARS } from "./lib/rules";
import { confirmPaySignature, payFixedPost } from "./transfer";
import { connectedPubkey, connectWallet, onWalletChange, shortenPubkey } from "./wallet";

type PayPhase = "idle" | "signing" | "waiting" | "paid" | "error";

type PayState = {
  draft: string;
  fromPubkey: string;
  orderId: string;
  invoiceId: string | null;
  txSig: string | null;
  postError: string | null;
  phase: PayPhase;
};

function displayUrl(url: string): string {
  return url.replace(/^https:\/\//, "");
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function mountPostPanel(): void {
  const draft = $("draft") as HTMLTextAreaElement;
  const count = $("count");
  const connectBtn = $("connect-wallet") as HTMLButtonElement;
  const payBtn = $("get-quote") as HTMLButtonElement;
  const quoteRoot = $("quote-root");
  const walletLabel = $("wallet-label");
  const reviewStatus = $("review-status");

  let state: PayState | null = null;
  let copied: string | null = null;
  let posted: PostedPair[] = [];
  const receive = defaultReceive();

  function setReviewStatus(text: string, bad = false): void {
    reviewStatus.textContent = text;
    reviewStatus.hidden = !text;
    reviewStatus.classList.toggle("is-bad", Boolean(text) && bad);
  }

  function silentRulesCheck(): boolean {
    const hits = checkDraft(draft.value);
    if (hits.length > 0) {
      setReviewStatus(hits.map((h) => h.message).join(" "), true);
      return false;
    }
    setReviewStatus("");
    return true;
  }

  function paying(): boolean {
    return Boolean(state && state.phase !== "idle" && state.phase !== "error");
  }

  function refreshWallet(): void {
    const key = connectedPubkey();
    walletLabel.textContent = key ? shortenPubkey(key) : "Not connected";
    connectBtn.textContent = key ? shortenPubkey(key) : "Connect";
    connectBtn.disabled = paying();
    updateButtons();
  }

  function updateButtons(): void {
    const locked = paying();
    draft.readOnly = locked;
    draft.classList.toggle("is-locked", locked);
    payBtn.disabled = locked || !connectedPubkey() || !isDraftClean(draft.value);
  }

  function updateCount(): void {
    const n = draft.value.length;
    count.textContent = `${n} / ${MAX_CHARS}`;
    count.classList.toggle("is-hot", n > MAX_CHARS - 20);
    updateButtons();
  }

  function renderQuote(): void {
    quoteRoot.replaceChildren();
    const card = document.createElement("div");
    card.className = "quote-card";
    const kicker = document.createElement("p");
    kicker.className = "eyebrow";
    kicker.textContent = "Pay";
    card.append(kicker);

    const amount = document.createElement("p");
    amount.className = "quote-amount";
    amount.textContent = `100,000 ${TOKEN_TICKER}`;
    card.append(amount);

    const meta = document.createElement("p");
    meta.className = "muted";
    const phase = state?.phase ?? "idle";
    if (phase === "signing") meta.textContent = "Sign in your wallet.";
    else if (phase === "waiting") meta.textContent = "Waiting";
    else if (phase === "paid") meta.textContent = "Paid";
    else if (phase === "error") meta.textContent = state?.postError || "Needs retry";
    else {
      meta.textContent = connectedPubkey()
        ? `Sign exactly 100,000 ${TOKEN_TICKER} from this wallet. Those tokens are burned after they land.`
        : `Connect Phantom or Solflare. Sign exactly 100,000 ${TOKEN_TICKER}.`;
    }
    card.append(meta);

    const dl = document.createElement("dl");
    dl.className = "quote-dl";
    addRow(dl, "Amount", `100,000 ${TOKEN_TICKER}`);
    addRow(dl, "Receive", receive);
    const from = state?.fromPubkey || connectedPubkey();
    if (from) addRow(dl, "From", from);
    card.append(dl);

    const actions = document.createElement("div");
    actions.className = "quote-actions";
    actions.append(copyButton("Copy address", "receive", receive));
    if (state?.phase === "error") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn btn-primary";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => {
        void startPay();
      });
      actions.append(retry);
    }
    card.append(actions);

    if (state?.txSig) {
      const tx = document.createElement("p");
      tx.className = "muted";
      const href = solscanTxUrl(state.txSig);
      tx.append(linkEl(href, displayUrl(href)));
      card.append(tx);
    }

    quoteRoot.append(card);
    renderPosted(quoteRoot);
  }

  function renderPosted(root: HTMLElement): void {
    if (posted.length === 0) return;
    const wrap = document.createElement("div");
    wrap.className = "posted";
    const title = document.createElement("p");
    title.className = "eyebrow";
    title.textContent = "Posted";
    wrap.append(title);
    for (const item of posted) {
      const row = document.createElement("div");
      row.className = "posted-row";
      row.append(linkEl(item.tweetUrl, displayUrl(item.tweetUrl)));
      const burnHref = solscanTxUrl(item.burnSignature);
      row.append(linkEl(burnHref, displayUrl(burnHref)));
      const time = document.createElement("time");
      time.dateTime = item.paidAt;
      time.textContent = formatTime(item.paidAt);
      row.append(time);
      wrap.append(row);
    }
    root.append(wrap);
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

  function addRow(dl: HTMLDListElement, key: string, value: string): void {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }

  function copyButton(label: string, key: string, value: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-secondary";
    btn.textContent = copied === key ? "Copied" : label;
    btn.addEventListener("click", () => {
      void (async () => {
        const ok = await copyText(value);
        copied = ok ? key : null;
        renderQuote();
        window.setTimeout(() => {
          if (copied === key) {
            copied = null;
            renderQuote();
          }
        }, 1400);
      })();
    });
    return btn;
  }

  async function startPay(): Promise<void> {
    if (paying() && state?.phase !== "error") return;
    if (!silentRulesCheck()) return;
    let fromPubkey = connectedPubkey();
    if (!fromPubkey) {
      try {
        fromPubkey = await connectWallet();
      } catch (error) {
        setReviewStatus(error instanceof Error ? error.message : "Could not connect.", true);
        refreshWallet();
        return;
      }
      refreshWallet();
    }
    if (!fromPubkey) return;
    if (!isDraftClean(draft.value)) return;

    const postText = draft.value.trim();
    const orderId = newOrderId();
    state = {
      draft: postText,
      fromPubkey,
      orderId,
      invoiceId: null,
      txSig: null,
      postError: null,
      phase: "signing",
    };
    setReviewStatus("");
    updateButtons();
    renderQuote();

    void createInvoice({
      orderId,
      postText,
      postTextHash: await postTextHash(postText),
      fromPubkey,
    }).then((invoice) => {
      if (state && state.orderId === orderId) {
        state = { ...state, invoiceId: invoice.invoiceId };
      }
    });

    try {
      const sent = await payFixedPost();
      if (!state || state.orderId !== orderId) return;
      state = { ...state, txSig: sent.signature, phase: "waiting" };
      renderQuote();
      await confirmPaySignature(sent);
      if (!state || state.orderId !== orderId) return;
      state = { ...state, phase: "paid" };
      renderQuote();
      updateButtons();
    } catch (error) {
      if (!state || state.orderId !== orderId) return;
      const message = error instanceof Error ? error.message : "Wallet transfer failed.";
      state = { ...state, phase: "error", postError: message };
      setReviewStatus(message, true);
      renderQuote();
      updateButtons();
    }
  }

  payBtn.textContent = `Pay 100,000 ${TOKEN_TICKER}`;
  payBtn.addEventListener("click", () => {
    void startPay();
  });

  connectBtn.addEventListener("click", () => {
    void (async () => {
      try {
        await connectWallet();
        setReviewStatus("");
      } catch (error) {
        setReviewStatus(error instanceof Error ? error.message : "Could not connect.", true);
      }
      refreshWallet();
      renderQuote();
    })();
  });

  draft.addEventListener("input", () => {
    updateCount();
    if (paying()) return;
    if (!draft.value.trim()) {
      setReviewStatus("");
      return;
    }
    silentRulesCheck();
  });

  onWalletChange(() => {
    refreshWallet();
    renderQuote();
  });

  updateCount();
  refreshWallet();
  renderQuote();
  void loadBoard().then((board) => {
    posted = board.posted;
    renderQuote();
  });
}
