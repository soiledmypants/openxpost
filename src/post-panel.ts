import { createInvoice, loadBoard, newOrderId, postPaidTweet, postTextHash, readPaid } from "../pay";
import type { InvoiceCreated, InvoicePaid, PostedPair } from "../pay/types";
import { solscanTxUrl } from "../pay/types";
import { receivePubkey as defaultReceive, TOKEN_TICKER } from "./config";
import { $, copyText } from "./lib/dom";
import { checkDraft, isDraftClean, MAX_CHARS } from "./lib/rules";
import { confirmPaySignature, payFixedPost } from "./transfer";
import { connectedPubkey, connectWallet, onWalletChange, shortenPubkey } from "./wallet";

const POLL_MS = 4000;

type PayState = {
  draft: string;
  fromPubkey: string;
  orderId: string;
  invoice: InvoiceCreated;
  paid: InvoicePaid | null;
  tweetUrl: string | null;
  postError: string | null;
  phase: "signing" | "waiting" | "posting" | "posted" | "error";
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

  let pollTimer = 0;
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
    return Boolean(state && state.phase !== "error" && state.phase !== "posted");
  }

  function refreshWallet(): void {
    const key = connectedPubkey();
    walletLabel.textContent = key ? shortenPubkey(key) : "Not connected";
    connectBtn.textContent = key ? "Connected" : "Connect";
    connectBtn.disabled = paying();
    updateButtons();
  }

  function updateButtons(): void {
    const locked = paying();
    draft.readOnly = locked;
    draft.classList.toggle("is-locked", locked);
    payBtn.disabled = locked || !isDraftClean(draft.value);
  }

  function updateCount(): void {
    const n = draft.value.length;
    count.textContent = `${n} / ${MAX_CHARS}`;
    count.classList.toggle("is-hot", n > MAX_CHARS - 20);
    updateButtons();
  }

  function stopPoll(): void {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }

  function upsertPosted(item: PostedPair): void {
    posted = [item, ...posted.filter((row) => row.invoiceId !== item.invoiceId)];
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

    const dest = document.createElement("p");
    dest.className = "muted";
    dest.textContent = `to ${receive}`;
    card.append(dest);

    const actions = document.createElement("div");
    actions.className = "quote-actions";
    actions.append(copyButton("Copy address", "receive", receive));
    if (state?.phase === "error" && !state.tweetUrl) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn btn-primary";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => {
        void resume();
      });
      actions.append(retry);
    }
    card.append(actions);

    const meta = document.createElement("p");
    meta.className = "muted";
    const phase = state?.phase;
    if (phase === "posted") meta.textContent = "Posted";
    else if (phase === "posting") meta.textContent = "Posting";
    else if (phase === "signing") meta.textContent = "Sign in your wallet.";
    else if (phase === "waiting") meta.textContent = "Waiting for the 100,000 $POST transfer";
    else if (phase === "error") meta.textContent = state?.postError || "Needs retry";
    else {
      meta.textContent = connectedPubkey()
        ? `Sign exactly 100,000 ${TOKEN_TICKER} from this wallet to the treasury.`
        : `Connect Phantom or Solflare. Sign exactly 100,000 ${TOKEN_TICKER} to the treasury.`;
    }
    card.append(meta);

    const paySig = state?.paid?.txSig ?? null;
    if (state && (state.tweetUrl || paySig || state.postError)) {
      card.append(renderPair(state.tweetUrl, paySig, state.postError));
    }

    quoteRoot.append(card);
    renderPosted(quoteRoot);
  }

  function renderPair(
    tweetUrl: string | null,
    txSig: string | null,
    postError: string | null,
  ): HTMLElement {
    const pair = document.createElement("div");
    pair.className = "pair";

    const tweetCol = document.createElement("div");
    tweetCol.className = "pair-col";
    const tweetLabel = document.createElement("p");
    tweetLabel.className = "eyebrow";
    tweetLabel.textContent = "Tweet";
    tweetCol.append(tweetLabel);
    if (tweetUrl) {
      tweetCol.append(linkEl(tweetUrl, displayUrl(tweetUrl)));
      tweetCol.append(copyButton("Copy tweet", "tweet", tweetUrl, true));
    } else if (postError) {
      const err = document.createElement("p");
      err.className = "muted";
      err.textContent = postError;
      tweetCol.append(err);
    } else {
      const pending = document.createElement("p");
      pending.className = "muted";
      pending.textContent = "Posting";
      tweetCol.append(pending);
    }

    const payCol = document.createElement("div");
    payCol.className = "pair-col";
    const payLabel = document.createElement("p");
    payLabel.className = "eyebrow";
    payLabel.textContent = "Payment";
    payCol.append(payLabel);
    if (txSig) {
      const href = solscanTxUrl(txSig);
      payCol.append(linkEl(href, displayUrl(href)));
      payCol.append(copyButton("Copy payment", "pay", txSig, true));
    } else {
      const pending = document.createElement("p");
      pending.className = "muted";
      pending.textContent = "Waiting";
      payCol.append(pending);
    }

    pair.append(tweetCol, payCol);
    return pair;
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
      const payHref = solscanTxUrl(item.txSig);
      row.append(linkEl(payHref, displayUrl(payHref)));
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

  function copyButton(label: string, key: string, value: string, ghost = false): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = ghost ? "btn btn-ghost" : "btn btn-secondary";
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

  async function tweet(): Promise<void> {
    if (!state?.paid) return;
    state = { ...state, phase: "posting", postError: null };
    renderQuote();
    const result = await postPaidTweet(state.invoice.invoiceId);
    if (!state) return;
    if (result.ok) {
      state = { ...state, phase: "posted", tweetUrl: result.tweetUrl, postError: null };
      if (state.paid?.txSig) {
        upsertPosted({
          invoiceId: state.invoice.invoiceId,
          tweetUrl: result.tweetUrl,
          txSig: state.paid.txSig,
          paidAt: state.paid.paidAt,
        });
      }
      const board = await loadBoard();
      posted = board.posted;
    } else {
      state = { ...state, phase: "error", postError: result.error };
      setReviewStatus(result.error, true);
    }
    renderQuote();
    updateButtons();
  }

  function startPoll(): void {
    stopPoll();
    pollTimer = window.setInterval(() => {
      void (async () => {
        if (!state || state.paid) return;
        const paid = await readPaid(state.invoice.invoiceId);
        if (!paid || !state) return;
        stopPoll();
        state = { ...state, paid, phase: "posting" };
        renderQuote();
        await tweet();
      })();
    }, POLL_MS);
  }

  async function resume(): Promise<void> {
    if (!state) return;
    if (state.tweetUrl) return;
    if (state.paid) {
      await tweet();
      return;
    }
    try {
      state = { ...state, phase: "signing", postError: null };
      setReviewStatus("");
      renderQuote();
      updateButtons();
      if (!connectedPubkey()) {
        await connectWallet();
        refreshWallet();
      }
      const sent = await payFixedPost();
      if (!state) return;
      state = { ...state, phase: "waiting" };
      renderQuote();
      await confirmPaySignature(sent);
      if (!state) return;
      startPoll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet transfer failed.";
      if (!state) return;
      state = { ...state, phase: "error", postError: message };
      setReviewStatus(message, true);
      renderQuote();
      updateButtons();
    }
  }

  async function startPay(): Promise<void> {
    if (paying()) return;
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
    if (!fromPubkey || !isDraftClean(draft.value)) return;

    payBtn.disabled = true;
    try {
      const postText = draft.value.trim();
      const orderId = newOrderId();
      const invoice = await createInvoice({
        orderId,
        postText,
        postTextHash: await postTextHash(postText),
        fromPubkey,
      });
      state = {
        draft: postText,
        fromPubkey,
        orderId,
        invoice,
        paid: null,
        tweetUrl: null,
        postError: null,
        phase: "signing",
      };
      setReviewStatus("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create invoice.";
      setReviewStatus(message, true);
      updateButtons();
      renderQuote();
      return;
    }
    renderQuote();
    updateButtons();
    await resume();
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
