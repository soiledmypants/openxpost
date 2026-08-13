import {
  createQuote,
  fetchSolPriceUsd,
  findPayment,
  isTreasuryConfigured,
  quoteIsExpired,
  remainingMs,
  TREASURY_NOT_SET,
  type PaymentHit,
  type Quote,
} from "../pay";
import { solanaRpc, treasuryAddress } from "./config";
import { answer, GREETING, reviewDraft, type ChatMessage, type ChatRole } from "./lib/agent";
import { $, copyText, formatCountdown } from "./lib/dom";
import { checkDraft, isDraftClean, MAX_CHARS } from "./lib/rules";

const WATCH_MS = 10_000;
const THINK_MS = 720;

type QuoteState = {
  quote: Quote;
  draft: string;
  payment: PaymentHit | null;
};

export function mountPostPanel(): void {
  const draft = $("draft") as HTMLTextAreaElement;
  const count = $("count");
  const log = $("agent-log");
  const form = $("agent-form") as HTMLFormElement;
  const ask = $("agent-ask") as HTMLInputElement;
  const reviewBtn = $("review") as HTMLButtonElement;
  const quoteBtn = $("get-quote") as HTMLButtonElement;
  const quoteRoot = $("quote-root");

  const messages: ChatMessage[] = [{ role: "agent", text: GREETING }];
  let thinking = false;
  let reviewTimer = 0;
  let tickTimer = 0;
  let watchTimer = 0;
  let state: QuoteState | null = null;
  let copied: "amount" | "treasury" | null = null;

  const treasury = treasuryAddress();
  const rpc = solanaRpc();

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
    quoteBtn.disabled = locked || thinking || !isDraftClean(draft.value);
  }

  function updateCount(): void {
    const n = draft.value.length;
    count.textContent = `${n} / ${MAX_CHARS}`;
    count.classList.toggle("is-hot", n > MAX_CHARS - 20);
    if (!state) {
      quoteBtn.disabled = thinking || !isDraftClean(draft.value);
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

  async function runReview(fromUser = false): Promise<void> {
    if (state) return;
    const text = draft.value;
    if (fromUser) {
      push("you", "Review this.");
    }
    await withThink(() => {
      push("agent", reviewDraft(text));
    });
    updateCount();
  }

  function stopWatch(): void {
    window.clearInterval(tickTimer);
    window.clearInterval(watchTimer);
    tickTimer = 0;
    watchTimer = 0;
  }

  function startWatch(): void {
    stopWatch();
    tickTimer = window.setInterval(() => {
      if (!state) return;
      if (quoteIsExpired(state.quote) && !state.payment) {
        stopWatch();
        void withThink(() => {
          push("agent", "Quote expired. Get a new unique amount. Do not send the old one.");
          state = null;
          setDraftLocked(false);
          renderQuote();
        });
        return;
      }
      renderQuote();
    }, 1000);

    if (!isTreasuryConfigured(treasury)) {
      return;
    }

    watchTimer = window.setInterval(() => {
      void watchOnce();
    }, WATCH_MS);
    void watchOnce();
  }

  async function watchOnce(): Promise<void> {
    if (!state || state.payment || quoteIsExpired(state.quote)) return;
    try {
      const hit = await findPayment(state.quote, { rpc });
      if (!hit || !state) return;
      state = { ...state, payment: hit };
      stopWatch();
      push(
        "agent",
        "Payment seen. The status link will appear here when the post goes up — never in the tweet.",
      );
      renderQuote();
    } catch {
      // Public RPC can throttle. Keep waiting until the quote expires.
    }
  }

  function renderQuote(): void {
    quoteRoot.replaceChildren();

    const card = document.createElement("div");
    card.className = "quote-card";

    const kicker = document.createElement("p");
    kicker.className = "eyebrow";
    kicker.textContent = "Quote";
    card.append(kicker);

    if (!state) {
      const p = document.createElement("p");
      p.className = "quote-empty";
      p.textContent =
        "A unique lamport amount (~$1 plus a 1–9999 suffix) is created when the draft clears the rules. Nine decimals. No wallet connect.";
      card.append(p);
      quoteRoot.append(card);
      return;
    }

    const { quote, payment } = state;
    const expired = quoteIsExpired(quote) && !payment;
    const configured = isTreasuryConfigured(quote.treasury);

    const amount = document.createElement("p");
    amount.className = "quote-amount";
    amount.textContent = `${quote.amountSol} SOL`;
    card.append(amount);

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = payment
      ? "Payment seen"
      : expired
        ? "Expired"
        : `${formatCountdown(remainingMs(quote))} remaining`;
    card.append(meta);

    const dl = document.createElement("dl");
    dl.className = "quote-dl";
    addRow(dl, "Post", state.draft);
    addRow(dl, "Lamports", quote.lamports.toString());
    addRow(dl, "Suffix", String(quote.suffix));
    addRow(dl, "Treasury", quote.treasury);
    card.append(dl);

    if (!configured || quote.treasury === TREASURY_NOT_SET) {
      const warn = document.createElement("p");
      warn.className = "notice";
      warn.textContent =
        "Treasury is TREASURY_NOT_SET. Do not send SOL. Watching is off until a public receiving address is configured.";
      card.append(warn);
    }

    const actions = document.createElement("div");
    actions.className = "quote-actions";

    actions.append(
      copyButton("Copy amount", "amount", quote.amountSol),
      copyButton("Copy treasury", "treasury", quote.treasury),
    );

    if (!payment) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-ghost";
      cancel.textContent = "Cancel quote";
      cancel.addEventListener("click", () => {
        stopWatch();
        state = null;
        copied = null;
        setDraftLocked(false);
        push("agent", "Quote cancelled. Draft is unlocked.");
        renderQuote();
        updateCount();
      });
      actions.append(cancel);
    }

    card.append(actions);

    const status = document.createElement("div");
    status.className = "status-box";
    const statusEyebrow = document.createElement("p");
    statusEyebrow.className = "eyebrow";
    statusEyebrow.textContent = "Status link";
    const statusBody = document.createElement("p");
    if (payment) {
      statusBody.textContent =
        "Returned on this site when the post is live. Never written into the tweet.";
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

  function copyButton(label: string, key: "amount" | "treasury", value: string): HTMLButtonElement {
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

  async function getQuote(): Promise<void> {
    if (state) return;
    const hits = checkDraft(draft.value);
    if (hits.length > 0) {
      await withThink(() => push("agent", hits.map((h) => h.message).join(" ")));
      return;
    }

    await withThink(async () => {
      let solPriceUsd: number;
      try {
        solPriceUsd = await fetchSolPriceUsd();
      } catch {
        push("agent", "SOL price is unavailable. Try again. No quote was created.");
        return;
      }

      const quote = createQuote({
        solPriceUsd,
        treasury,
      });
      state = { quote, draft: draft.value.trim(), payment: null };
      setDraftLocked(true);
      startWatch();
      push(
        "agent",
        configuredMessage(quote.treasury, quote.amountSol, solPriceUsd),
      );
    });
    renderQuote();
    updateCount();
  }

  function configuredMessage(addr: string, amountSol: string, solPriceUsd: number): string {
    const price = solPriceUsd.toFixed(2);
    if (!isTreasuryConfigured(addr)) {
      return `Quote ready: ${amountSol} SOL (~$1 at $${price}/SOL). Treasury is not set. Do not send funds.`;
    }
    return `Quote ready: ${amountSol} SOL (~$1 at $${price}/SOL). Send that exact amount. Nine decimals. Do not round.`;
  }

  draft.addEventListener("input", () => {
    updateCount();
    window.clearTimeout(reviewTimer);
    if (state) return;
    reviewTimer = window.setTimeout(() => {
      const hits = checkDraft(draft.value);
      if (draft.value.trim() && hits.length > 0) {
        const last = messages[messages.length - 1];
        const text = hits.map((h) => h.message).join(" ");
        if (last?.role !== "agent" || last.text !== text) {
          push("agent", text);
        }
      }
    }, 900);
  });

  reviewBtn.addEventListener("click", () => {
    void runReview(true);
  });

  quoteBtn.addEventListener("click", () => {
    void getQuote();
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
}
