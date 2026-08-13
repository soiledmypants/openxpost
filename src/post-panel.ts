import {
  createInvoice,
  fetchMintMeta,
  formatTokenAmount,
  type PayPhase,
} from "../pay";
import { payApi, solanaRpc, tokenAmount, tokenMint } from "./config";
import { answer, GREETING, reviewDraft, type ChatMessage, type ChatRole } from "./lib/agent";
import { $ } from "./lib/dom";
import { checkDraft, isDraftClean, MAX_CHARS } from "./lib/rules";
import {
  clearPaySession,
  getPayNotice,
  getPaySession,
  startPaySession,
  subscribePay,
} from "./pay-ui/store";

const THINK_MS = 720;

export function mountPostPanel(): void {
  const draft = $("draft") as HTMLTextAreaElement;
  const count = $("count");
  const log = $("agent-log");
  const form = $("agent-form") as HTMLFormElement;
  const ask = $("agent-ask") as HTMLInputElement;
  const reviewBtn = $("review") as HTMLButtonElement;
  const quoteBtn = $("get-quote") as HTMLButtonElement;

  const messages: ChatMessage[] = [{ role: "agent", text: GREETING }];
  let thinking = false;
  let reviewTimer = 0;
  let lastPhase: PayPhase | null = null;
  let lastNoticeAt = 0;

  const rpc = solanaRpc();
  const amount = formatTokenAmount(tokenAmount());

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
    if (!getPaySession()) {
      quoteBtn.disabled = thinking || !isDraftClean(draft.value);
    }
  }

  async function withThink<T>(work: () => T | Promise<T>): Promise<T> {
    thinking = true;
    setDraftLocked(Boolean(getPaySession()));
    renderChat();
    await new Promise((r) => window.setTimeout(r, THINK_MS));
    try {
      return await work();
    } finally {
      thinking = false;
      setDraftLocked(Boolean(getPaySession()));
      renderChat();
    }
  }

  function push(role: ChatRole, text: string): void {
    messages.push({ role, text });
    renderChat();
  }

  async function runReview(fromUser = false): Promise<void> {
    if (getPaySession()) return;
    const text = draft.value;
    if (fromUser) {
      push("you", "Review this.");
    }
    await withThink(() => {
      push("agent", reviewDraft(text));
    });
    updateCount();
  }

  function syncSession(): void {
    const session = getPaySession();
    setDraftLocked(Boolean(session));
    updateCount();

    const notice = getPayNotice();
    if (notice && notice.at !== lastNoticeAt) {
      lastNoticeAt = notice.at;
      push("agent", notice.text);
    }

    if (!session) {
      lastPhase = null;
      return;
    }

    if (session.phase === lastPhase) return;
    lastPhase = session.phase;
    if (session.phase === "paid") {
      push("agent", `Payment seen. Burning ${amount} tokens. Supply goes down.`);
    } else if (session.phase === "done") {
      push(
        "agent",
        "Done. The status link will appear here when the post goes up — never in the tweet. Follow @OpenXPost.",
      );
    }
  }

  async function getQuote(): Promise<void> {
    if (getPaySession()) return;
    const hits = checkDraft(draft.value);
    if (hits.length > 0) {
      await withThink(() => push("agent", hits.map((h) => h.message).join(" ")));
      return;
    }

    await withThink(async () => {
      try {
        const invoice = await createInvoice({
          mint: tokenMint(),
          amountTokens: tokenAmount(),
          payApi: payApi(),
          allowDemo: import.meta.env.DEV,
        });
        const mintMeta = await fetchMintMeta(rpc, invoice.mint);
        startPaySession({ invoice, draft: draft.value.trim(), mintMeta });
        setDraftLocked(true);
        push("agent", invoiceMessage(invoice.source, amount, mintMeta.decimals));
      } catch {
        clearPaySession();
        push("agent", "Could not create an invoice or read mint decimals. Try again. Nothing was sent.");
      }
    });
    updateCount();
  }

  draft.addEventListener("input", () => {
    updateCount();
    window.clearTimeout(reviewTimer);
    if (getPaySession()) return;
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

  subscribePay(syncSession);
  updateCount();
  renderChat();
  setDraftLocked(false);
}

function invoiceMessage(
  source: "api" | "demo" | "offline",
  amount: string,
  decimals: number,
): string {
  const decimalsNote = `Mint decimals are ${decimals} — the transfer is exactly ${amount} tokens, not a guessed 6 or 9.`;
  if (source === "offline") {
    return `Invoice ready, but the pay watcher is not connected. No receive address. Do not send tokens. ${decimalsNote}`;
  }
  if (source === "demo") {
    return `Invoice ready: ${amount} tokens to a demo receive address. Pay watcher not connected. ${decimalsNote}`;
  }
  return `Invoice ready: connect a wallet and send exactly ${amount} tokens. Those tokens are burned. ${decimalsNote}`;
}
