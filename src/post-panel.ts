import { createInvoice, newOrderId, postPaidTweet, postTextHash, readPaid } from "../pay";
import type { InvoiceCreated, InvoicePaid } from "../pay/types";
import { amountTokens } from "./config";
import { answer, GREETING, reviewDraft, type ChatMessage, type ChatRole } from "./lib/agent";
import { $, copyText } from "./lib/dom";
import { checkDraft, isDraftClean, MAX_CHARS } from "./lib/rules";
import { payInvoice } from "./transfer";
import { availableWallets, connectedPubkey, connectWallet } from "./wallet";

const THINK_MS = 720;
const POLL_MS = 4000;

type PayState = {
  draft: string;
  orderId: string;
  invoice: InvoiceCreated;
  paid: InvoicePaid | null;
  tweetUrl: string | null;
  postError: string | null;
  phase: "invoice" | "paying" | "burning" | "posting" | "posted" | "error";
};

export function mountPostPanel(): void {
  const draft = $("draft") as HTMLTextAreaElement;
  const count = $("count");
  const log = $("agent-log");
  const form = $("agent-form") as HTMLFormElement;
  const ask = $("agent-ask") as HTMLInputElement;
  const reviewBtn = $("review") as HTMLButtonElement;
  const payBtn = $("get-quote") as HTMLButtonElement;
  const connectBtn = $("connect-wallet") as HTMLButtonElement | null;
  const quoteRoot = $("quote-root");
  const walletLabel = $("wallet-label");

  const messages: ChatMessage[] = [{ role: "agent", text: GREETING }];
  let thinking = false;
  let reviewTimer = 0;
  let pollTimer = 0;
  let state: PayState | null = null;
  let copied: "receive" | "status" | null = null;

  const tokens = amountTokens();

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

  function refreshWalletLabel(): void {
    const key = connectedPubkey();
    walletLabel.textContent = key ? `${key.slice(0, 4)}…${key.slice(-4)}` : "Not connected";
    if (connectBtn) {
      connectBtn.textContent = key ? "Wallet connected" : "Connect wallet";
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

  function renderQuote(): void {
    quoteRoot.replaceChildren();
    const card = document.createElement("div");
    card.className = "quote-card";
    const kicker = document.createElement("p");
    kicker.className = "eyebrow";
    kicker.textContent = "Pay";
    card.append(kicker);

    if (!state) {
      const amount = document.createElement("p");
      amount.className = "quote-amount";
      amount.textContent = `${tokens.toLocaleString("en-US")} tokens`;
      const p = document.createElement("p");
      p.className = "quote-empty";
      p.textContent =
        "Connect Phantom or Solflare. Sign a transfer of exactly this amount. Those tokens are burned after they land.";
      card.append(amount, p);
      quoteRoot.append(card);
      return;
    }

    const amount = document.createElement("p");
    amount.className = "quote-amount";
    amount.textContent = `${state.invoice.amountTokens.toLocaleString("en-US")} tokens`;
    card.append(amount);

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent =
      state.phase === "posted"
        ? "Posted"
        : state.phase === "posting"
          ? "Posting"
          : state.phase === "burning"
            ? "Burning"
            : state.phase === "paying"
              ? "Waiting for signature"
              : state.phase === "error"
                ? "Needs retry"
                : "Invoice ready";
    card.append(meta);

    const burn = document.createElement("p");
    burn.className = "notice";
    burn.textContent = `Flywheel: the ${state.invoice.amountTokens.toLocaleString("en-US")} tokens are burned after they land. They are not kept.`;
    card.append(burn);

    const dl = document.createElement("dl");
    dl.className = "quote-dl";
    addRow(dl, "Receive", state.invoice.receivePubkey);
    addRow(dl, "Mint", state.invoice.mint);
    addRow(dl, "Amount", String(state.invoice.amountTokens));
    if (state.paid?.burnSignature) addRow(dl, "Burn", state.paid.burnSignature);
    card.append(dl);

    const actions = document.createElement("div");
    actions.className = "quote-actions";
    actions.append(copyButton("Copy receive", "receive", state.invoice.receivePubkey));
    if (state.tweetUrl) {
      actions.append(copyButton("Copy status", "status", state.tweetUrl));
    }
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

    const status = document.createElement("div");
    status.className = "status-box";
    const statusEyebrow = document.createElement("p");
    statusEyebrow.className = "eyebrow";
    statusEyebrow.textContent = "Status link";
    const statusBody = document.createElement("p");
    if (state.tweetUrl) {
      const link = document.createElement("a");
      link.className = "status-url";
      link.href = state.tweetUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = state.tweetUrl;
      statusBody.append(link);
    } else if (state.postError) {
      statusBody.textContent = state.postError;
    } else {
      statusBody.className = "muted";
      statusBody.textContent = "The tweet URL appears here after the post — not in the tweet.";
    }
    status.append(statusEyebrow, statusBody);
    card.append(status);
    quoteRoot.append(card);
  }

  function addRow(dl: HTMLDListElement, key: string, value: string): void {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }

  function copyButton(label: string, key: "receive" | "status", value: string): HTMLButtonElement {
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

  async function tweet(): Promise<void> {
    if (!state?.paid) return;
    state = { ...state, phase: "posting", postError: null };
    renderQuote();
    const result = await postPaidTweet(state.invoice.invoiceId);
    if (!state) return;
    if (result.ok) {
      state = { ...state, phase: "posted", tweetUrl: result.tweetUrl, postError: null };
      push("agent", "Posted. The status link is on this page — not in the tweet.");
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
    try {
      state = { ...state, phase: "paying", postError: null };
      renderQuote();
      if (!connectedPubkey()) {
        await connectWallet();
        refreshWalletLabel();
      }
      await payInvoice(state.invoice);
      state = { ...state, phase: "burning" };
      push("agent", "Transfer signed. Waiting for burn.");
      renderQuote();
      startPoll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet transfer failed.";
      state = { ...state, phase: "error", postError: message };
      push("agent", message);
      renderQuote();
    }
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
        if (!connectedPubkey()) {
          await connectWallet();
          refreshWalletLabel();
        }
        const postText = draft.value.trim();
        const orderId = newOrderId();
        const invoice = await createInvoice({
          orderId,
          postText,
          postTextHash: await postTextHash(postText),
        });
        state = {
          draft: postText,
          orderId,
          invoice,
          paid: null,
          tweetUrl: null,
          postError: null,
          phase: "invoice",
        };
        setDraftLocked(true);
        push(
          "agent",
          `Invoice ready. Sign a transfer of ${invoice.amountTokens.toLocaleString("en-US")} tokens. They will be burned after they land.`,
        );
      } catch (error) {
        push("agent", error instanceof Error ? error.message : "Could not create invoice.");
      }
    });
    renderQuote();
    updateCount();
    if (state) await resume();
  }

  payBtn.textContent = `Pay ${tokens.toLocaleString("en-US")}`;
  payBtn.addEventListener("click", () => {
    void startPay();
  });

  connectBtn?.addEventListener("click", () => {
    void (async () => {
      try {
        await connectWallet();
        const names = availableWallets()
          .filter((w) => w.ready)
          .map((w) => w.name)
          .join(", ");
        push("agent", names ? `Connected. ${names} available.` : "Wallet connected.");
      } catch (error) {
        push("agent", error instanceof Error ? error.message : "Could not connect.");
      }
      refreshWalletLabel();
    })();
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
  refreshWalletLabel();
  renderChat();
  renderQuote();
  setDraftLocked(false);
}
