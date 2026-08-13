import { createInvoice, loadBoard, newOrderId, postPaidTweet, postTextHash } from "../pay";
import type { InvoiceCreated, InvoicePaid, PostedPair } from "../pay/types";
import { solscanTxUrl } from "../pay/types";
import { receivePubkey as defaultReceive, TOKEN_TICKER, tokenMint } from "./config";
import { $, copyText } from "./lib/dom";
import { checkDraft, isDraftClean, MAX_CHARS } from "./lib/rules";
import { clearPayPrefetch, payFixedPost, prefetchPayTransfer, watchPaySignature } from "./transfer";
import { connectedPubkey, connectWallet, onWalletChange, shortenPubkey } from "./wallet";

type PayState = {
  draft: string;
  fromPubkey: string;
  orderId: string;
  invoice: InvoiceCreated | null;
  paid: InvoicePaid | null;
  tweetUrl: string | null;
  postError: string | null;
  phase: "signing" | "posting" | "posted" | "error";
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

function shortenSig(sig: string): string {
  if (sig.length <= 16) return sig;
  return `${sig.slice(0, 8)}…${sig.slice(-8)}`;
}

export function mountPostPanel(): void {
  const draft = $("draft") as HTMLTextAreaElement;
  const count = $("count");
  const connectBtn = $("connect-wallet") as HTMLButtonElement;
  const payBtn = $("get-quote") as HTMLButtonElement;
  const quoteRoot = $("quote-root");
  const walletLabel = $("wallet-label");
  const reviewStatus = $("review-status");
  const postsList = document.getElementById("posts-list");
  const postsCount = document.getElementById("posts-count");

  let state: PayState | null = null;
  let copied: string | null = null;
  let posted: PostedPair[] = [];
  let invoiceWork: Promise<InvoiceCreated> | null = null;
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
    return state?.phase === "signing";
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
    if (state?.phase === "error" && state.paid && !state.tweetUrl) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn btn-primary";
      retry.textContent = "Retry tweet";
      retry.addEventListener("click", () => {
        void tweet();
      });
      actions.append(retry);
    } else if (state?.phase === "error" && !state.paid) {
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
    if (phase === "posted") meta.textContent = "Posted. See Posts.";
    else if (phase === "posting") meta.textContent = "Paid. Posting.";
    else if (phase === "signing") meta.textContent = "Sign in your wallet.";
    else if (phase === "error") {
      meta.textContent = state?.paid
        ? state.postError || "Paid. Tweet needs retry."
        : state?.postError || "Needs retry";
    } else {
      meta.textContent = connectedPubkey()
        ? `Sign exactly 100,000 ${TOKEN_TICKER} from this wallet to the treasury.`
        : `Connect Phantom or Solflare. Sign exactly 100,000 ${TOKEN_TICKER} to the treasury.`;
    }
    card.append(meta);

    if (state?.paid?.txSig) {
      const payLine = document.createElement("p");
      payLine.className = "muted";
      const href = solscanTxUrl(state.paid.txSig);
      payLine.append(linkEl(href, displayUrl(href)));
      card.append(payLine);
    }

    if (state?.tweetUrl) {
      card.append(linkEl(state.tweetUrl, displayUrl(state.tweetUrl)));
    }

    quoteRoot.append(card);
  }

  function renderPosts(): void {
    if (postsCount) {
      postsCount.textContent = posted.length === 1 ? "1 post" : `${posted.length} posts`;
    }
    if (!postsList) return;
    postsList.replaceChildren();
    if (posted.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No posts yet.";
      postsList.append(empty);
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
      if (item.paidAt) {
        const time = document.createElement("time");
        time.dateTime = item.paidAt;
        time.textContent = formatTime(item.paidAt);
        links.append(time);
      }
      row.append(links);
      postsList.append(row);
    }
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

  async function ensureInvoice(): Promise<InvoiceCreated> {
    if (state?.invoice) return state.invoice;
    if (invoiceWork) {
      const invoice = await invoiceWork;
      if (state) {
        state = {
          ...state,
          invoice,
          paid: state.paid
            ? {
                ...state.paid,
                invoiceId: invoice.invoiceId,
                orderId: invoice.orderId,
                amountTokens: invoice.amountTokens,
                mint: invoice.mint,
              }
            : null,
        };
      }
      return invoice;
    }
    throw new Error("Could not create invoice. Payment is kept; retry tweet.");
  }

  async function tweet(): Promise<void> {
    if (!state?.paid) return;
    const orderId = state.orderId;
    const paid = state.paid;
    const draftText = state.draft;
    state = { ...state, phase: "posting", postError: null };
    setReviewStatus("");
    renderQuote();
    try {
      const invoice = await ensureInvoice();
      if (!state || state.orderId !== orderId) return;
      const result = await postPaidTweet({
        invoiceId: invoice.invoiceId,
        txSig: paid.txSig,
        postText: draftText,
        fromPubkey: state.fromPubkey,
      });
      if (!state || state.orderId !== orderId) return;
      if (result.ok) {
        state = { ...state, invoice, phase: "posted", tweetUrl: result.tweetUrl, postError: null };
        upsertPosted({
          invoiceId: invoice.invoiceId,
          tweetUrl: result.tweetUrl,
          tweetText: draftText,
          txSig: paid.txSig,
          paidAt: paid.paidAt,
        });
        const board = await loadBoard();
        posted = board.posted;
        renderPosts();
      } else {
        state = { ...state, invoice, phase: "error", postError: result.error };
        setReviewStatus(result.error, true);
      }
    } catch (error) {
      if (!state || state.orderId !== orderId) return;
      const message = error instanceof Error ? error.message : "Could not post. Payment is kept; retry tweet.";
      state = { ...state, phase: "error", postError: message };
      setReviewStatus(message, true);
    }
    renderQuote();
    updateButtons();
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
        void prefetchPayTransfer();
      }
      const sent = await payFixedPost();
      if (!state) return;
      watchPaySignature(sent.signature);
      const paidAt = new Date().toISOString();
      state = {
        ...state,
        phase: "posting",
        paid: {
          type: "invoice.paid",
          invoiceId: state.invoice?.invoiceId ?? "",
          orderId: state.orderId,
          txSig: sent.signature,
          paidAt,
          payer: state.fromPubkey,
          amountTokens: state.invoice?.amountTokens ?? 100_000,
          mint: state.invoice?.mint ?? tokenMint(),
          slot: 0,
        },
      };
      renderQuote();
      updateButtons();
      await tweet();
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
        void prefetchPayTransfer();
      } catch (error) {
        setReviewStatus(error instanceof Error ? error.message : "Could not connect.", true);
        refreshWallet();
        return;
      }
      refreshWallet();
    }
    if (!fromPubkey || !isDraftClean(draft.value)) return;

    const postText = draft.value.trim();
    const orderId = newOrderId();
    invoiceWork = postTextHash(postText).then((hash) =>
      createInvoice({ orderId, postText, postTextHash: hash, fromPubkey: fromPubkey as string }),
    );
    invoiceWork
      .then((invoice) => {
        if (state && state.orderId === orderId) {
          state = { ...state, invoice };
        }
      })
      .catch(() => undefined);

    state = {
      draft: postText,
      fromPubkey,
      orderId,
      invoice: null,
      paid: null,
      tweetUrl: null,
      postError: null,
      phase: "signing",
    };
    setReviewStatus("");
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
        void prefetchPayTransfer();
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
    if (connectedPubkey()) void prefetchPayTransfer();
    else clearPayPrefetch();
    refreshWallet();
    renderQuote();
  });

  updateCount();
  refreshWallet();
  renderQuote();
  renderPosts();
  void loadBoard().then((board) => {
    posted = board.posted;
    renderPosts();
  });
}
