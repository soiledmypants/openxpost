import { createInvoice, loadBoard, newOrderId, postPaidTweet, postTextHash, readPaid } from "../pay";
import type { InvoiceCreated, InvoicePaid, PostedPair } from "../pay/types";
import { solscanTxUrl } from "../pay/types";
import { receivePubkey as defaultReceive } from "./config";
import { answer, GREETING, reviewDraft, type ChatMessage, type ChatRole } from "./lib/agent";
import { $, copyText } from "./lib/dom";
import { checkDraft, isDraftClean, MAX_CHARS } from "./lib/rules";

const THINK_MS = 720;
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
  const log = $("agent-log");
  const form = $("agent-form") as HTMLFormElement;
  const ask = $("agent-ask") as HTMLInputElement;
  const reviewBtn = $("review") as HTMLButtonElement;
  const payBtn = $("get-quote") as HTMLButtonElement;
  const quoteRoot = $("quote-root");

  const messages: ChatMessage[] = [{ role: "agent", text: GREETING }];
  let thinking = false;
  let reviewTimer = 0;
  let pollTimer = 0;
  let state: PayState | null = null;
  let copied: string | null = null;
  let receive = defaultReceive();
  let posted: PostedPair[] = [];

  function renderChat(): void {
    log.replaceChildren();
    for (const msg of messages) {
      const row = document.createElement("div");
      row.className = `msg msg-${msg.role}`;
      const who = document.createElement("span");
      who.className = "msg-who";
      who.textContent = msg.role === "agent" ? "OpenXPost" : "You";
      const body = document.createElement("p");
      body.textContent = msg.text;
      row.append(who, body);
      log.append(row);
    }
    if (thinking) {
      const row = document.createElement("div");
      row.className = "thinking";
      row.setAttribute("aria-live", "polite");
      const label = document.createElement("span");
      label.textContent = "Thinking";
      const bar = document.createElement("span");
      bar.className = "thinking-bar";
      bar.append(document.createElement("span"));
      row.append(label, bar);
      log.append(row);
    }
    log.scrollTop = log.scrollHeight;
  }

  function setDraftLocked(locked: boolean): void {
    draft.readOnly = locked;
    draft.classList.toggle("is-locked", locked);
    reviewBtn.disabled = locked || thinking;
    payBtn.disabled = locked || thinking || !isDraftClean(draft.value);
  }

  function updateCount(): void {
    const n = draft.value.length;
    count.textContent = `${n} / ${MAX_CHARS}`;
    count.classList.toggle("is-hot", n > MAX_CHARS - 20);
    if (!state) {
      payBtn.disabled = thinking || !isDraftClean(draft.value);
    }
  }

  async function withThink<T>(work: () => T | Promise<T>): Promise<T> {
    thinking = true;
    setDraftLocked(Boolean(state));
    renderChat();
    await new Promise((r) => window.setTimeout(r, THINK_MS));
    try {
      return await work();
    } finally {
      thinking = false;
      setDraftLocked(Boolean(state));
      renderChat();
    }
  }

  function push(role: ChatRole, text: string): void {
    messages.push({ role, text });
    renderChat();
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

    const payTo = state?.invoice.receivePubkey ?? receive;
    const amountUi = state?.invoice.amountUi ?? null;

    const amount = document.createElement("p");
    amount.className = "quote-amount";
    amount.textContent = amountUi ? `${amountUi} ROOTS` : "Unique amount";
    card.append(amount);

    const meta = document.createElement("p");
    meta.className = "muted";
    if (!state) {
      meta.textContent =
        "Get a unique amount. Send exactly that ROOTS amount to the receive wallet. Those tokens are burned after they land.";
    } else {
      meta.textContent =
        state.phase === "posted"
          ? "Posted"
          : state.phase === "posting"
            ? "Posting"
            : state.phase === "error"
              ? "Needs retry"
              : `Send exactly ${state.invoice.amountUi} ROOTS`;
    }
    card.append(meta);

    const dl = document.createElement("dl");
    dl.className = "quote-dl";
    if (amountUi) addRow(dl, "Amount", amountUi);
    addRow(dl, "Receive", payTo);
    if (state) addRow(dl, "Mint", state.invoice.mint);
    card.append(dl);

    const actions = document.createElement("div");
    actions.className = "quote-actions";
    if (amountUi) actions.append(copyButton("Copy amount", "amount", amountUi));
    actions.append(copyButton("Copy address", "receive", payTo));
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

    const burnSig = state?.paid?.burnSignature ?? null;
    if (state && (state.tweetUrl || burnSig)) {
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

  function addRow(dl: HTMLDListElement, key: string, value: string): void {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
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
      push("agent", "Posted. Tweet and burn are paired on this page — not in the tweet.");
      await refreshBoard();
    } else {
      state = { ...state, phase: "error", postError: result.error };
      push("agent", result.error);
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
        push("agent", "Payment landed and burned. Posting on X.");
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
      await withThink(() => push("agent", hits.map((h) => h.message).join(" ")));
      return;
    }
    await withThink(async () => {
      try {
        const postText = draft.value.trim();
        const orderId = newOrderId();
        const invoice = await createInvoice({
          orderId,
          postText,
          postTextHash: await postTextHash(postText),
        });
        receive = invoice.receivePubkey || receive;
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
        push(
          "agent",
          `Send exactly ${invoice.amountUi} ROOTS to the receive wallet. Copy amount and address. Those tokens are burned after they land.`,
        );
      } catch (error) {
        push("agent", error instanceof Error ? error.message : "Could not create invoice.");
      }
    });
    renderQuote();
    updateCount();
    if (state) startPoll();
  }

  payBtn.textContent = "Get amount";
  payBtn.addEventListener("click", () => {
    void startPay();
  });

  reviewBtn.addEventListener("click", () => {
    void withThink(() => {
      push("you", "Review this.");
      push("agent", reviewDraft(draft.value));
    });
  });

  draft.addEventListener("input", () => {
    updateCount();
    window.clearTimeout(reviewTimer);
    if (state) return;
    reviewTimer = window.setTimeout(() => {
      const hits = checkDraft(draft.value);
      if (draft.value.trim() && hits.length > 0) {
        push("agent", hits.map((h) => h.message).join(" "));
      }
    }, 900);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = ask.value.trim();
    if (!q || thinking) return;
    ask.value = "";
    push("you", q);
    void withThink(() => {
      push("agent", answer(q, draft.value));
    });
  });

  updateCount();
  renderChat();
  renderQuote();
  setDraftLocked(false);
  void refreshBoard();
}
