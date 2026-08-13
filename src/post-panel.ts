import { createInvoice, loadBoard, newOrderId, postPaidTweet, postTextHash, readPaid } from "../pay";
import type { InvoiceCreated, InvoicePaid, PostedPair } from "../pay/types";
import { solscanTxUrl } from "../pay/types";
import { receivePubkey as defaultReceive, TOKEN_TICKER } from "./config";
import { $, copyText } from "./lib/dom";
import { checkDraft, isDraftClean, MAX_CHARS } from "./lib/rules";

const POLL_MS = 4000;

type PayState = {
  draft: string;
  orderId: string;
  invoice: InvoiceCreated;
  paid: InvoicePaid | null;
  tweetUrl: string | null;
  postError: string | null;
  phase: "waiting" | "posting" | "posted" | "error";
};

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

function displayUrl(url: string): string {
  return url.replace(/^https:\/\//, "");
}

export function mountPostPanel(): void {
  const draft = $("draft") as HTMLTextAreaElement;
  const count = $("count");
  const payBtn = $("get-quote") as HTMLButtonElement;
  const quoteRoot = $("quote-root");

  let pollTimer = 0;
  let state: PayState | null = null;
  let copied: string | null = null;
  let receive = defaultReceive();
  let posted: PostedPair[] = [];
  let payError: string | null = null;

  function setDraftLocked(locked: boolean): void {
    draft.readOnly = locked;
    draft.classList.toggle("is-locked", locked);
    payBtn.disabled = locked || !isDraftClean(draft.value);
  }

  function updateCount(): void {
    const n = draft.value.length;
    count.textContent = `${n} / ${MAX_CHARS}`;
    count.classList.toggle("is-hot", n > MAX_CHARS - 20);
    if (!state) {
      payBtn.disabled = !isDraftClean(draft.value);
    }
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

    if (payError && !state) {
      const err = document.createElement("p");
      err.className = "notice";
      err.textContent = payError;
      card.append(err);
      quoteRoot.append(card);
      renderPosted(quoteRoot);
      return;
    }

    if (!state) {
      const meta = document.createElement("p");
      meta.className = "muted";
      meta.textContent = `Draft the post, then get a unique ${TOKEN_TICKER} amount.`;
      card.append(meta);
      quoteRoot.append(card);
      renderPosted(quoteRoot);
      return;
    }

    const amountUi = state.invoice.amountUi;
    const payTo = state.invoice.receivePubkey || receive;
    const line = document.createElement("p");
    line.className = "quote-amount";
    line.textContent = `send ${amountUi} ${TOKEN_TICKER} to ${payTo}`;
    card.append(line);

    const actions = document.createElement("div");
    actions.className = "quote-actions";
    actions.append(copyButton("Copy amount", "amount", amountUi));
    actions.append(copyButton("Copy address", "receive", payTo));
    if (state.phase === "error" && !state.tweetUrl) {
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

    const burnSig = state.paid?.burnSignature ?? null;
    if (state.tweetUrl || burnSig || state.postError) {
      card.append(renderPair(state.tweetUrl, burnSig, state.postError));
    }

    quoteRoot.append(card);
    renderPosted(quoteRoot);
  }

  function renderPair(
    tweetUrl: string | null,
    burnSignature: string | null,
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

    const burnCol = document.createElement("div");
    burnCol.className = "pair-col";
    const burnLabel = document.createElement("p");
    burnLabel.className = "eyebrow";
    burnLabel.textContent = "Burn";
    burnCol.append(burnLabel);
    if (burnSignature) {
      const href = solscanTxUrl(burnSignature);
      burnCol.append(linkEl(href, displayUrl(href)));
      burnCol.append(copyButton("Copy burn", "burn", burnSignature, true));
    } else {
      const pending = document.createElement("p");
      pending.className = "muted";
      pending.textContent = "Waiting";
      burnCol.append(pending);
    }

    pair.append(tweetCol, burnCol);
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

  async function refreshBoard(): Promise<void> {
    const board = await loadBoard();
    receive = board.receivePubkey || defaultReceive();
    posted = board.posted;
    if (state?.tweetUrl && state.paid?.burnSignature) {
      upsertPosted({
        invoiceId: state.invoice.invoiceId,
        tweetUrl: state.tweetUrl,
        burnSignature: state.paid.burnSignature,
        paidAt: state.paid.paidAt,
      });
    }
    renderQuote();
  }

  async function tweet(): Promise<void> {
    if (!state?.paid) return;
    state = { ...state, phase: "posting", postError: null };
    renderQuote();
    const result = await postPaidTweet(state.invoice.invoiceId);
    if (!state) return;
    if (result.ok) {
      state = { ...state, phase: "posted", tweetUrl: result.tweetUrl, postError: null };
      if (state.paid?.burnSignature) {
        upsertPosted({
          invoiceId: state.invoice.invoiceId,
          tweetUrl: result.tweetUrl,
          burnSignature: state.paid.burnSignature,
          paidAt: state.paid.paidAt,
        });
      }
      await refreshBoard();
    } else {
      state = { ...state, phase: "error", postError: result.error };
    }
    renderQuote();
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
    state = { ...state, phase: "waiting", postError: null };
    renderQuote();
    startPoll();
  }

  async function startPay(): Promise<void> {
    if (state) return;
    const hits = checkDraft(draft.value);
    if (hits.length > 0) {
      payError = hits.map((h) => h.message).join(" ");
      renderQuote();
      return;
    }
    payBtn.disabled = true;
    try {
      const postText = draft.value.trim();
      const orderId = newOrderId();
      const invoice = await createInvoice({
        orderId,
        postText,
        postTextHash: await postTextHash(postText),
      });
      receive = invoice.receivePubkey || receive;
      payError = null;
      state = {
        draft: postText,
        orderId,
        invoice,
        paid: null,
        tweetUrl: null,
        postError: null,
        phase: "waiting",
      };
      setDraftLocked(true);
    } catch (error) {
      payError = error instanceof Error ? error.message : "Could not create invoice.";
    }
    renderQuote();
    updateCount();
    if (state) startPoll();
    else payBtn.disabled = !isDraftClean(draft.value);
  }

  payBtn.textContent = "Get amount";
  payBtn.addEventListener("click", () => {
    void startPay();
  });

  draft.addEventListener("input", () => {
    updateCount();
    if (!state) {
      const hits = checkDraft(draft.value);
      if (draft.value.trim() && hits.length > 0) {
        payError = hits.map((h) => h.message).join(" ");
      } else {
        payError = null;
      }
      renderQuote();
    }
  });

  updateCount();
  renderQuote();
  setDraftLocked(false);
  void refreshBoard();
}
