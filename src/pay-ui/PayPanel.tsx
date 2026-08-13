import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import {
  buildExactTokenTransfer,
  canSend,
  fetchInvoiceStatus,
  findBurnSignature,
  findInboundTokens,
  DEFAULT_TOKEN_AMOUNT,
  formatTokenAmount,
  invoiceIsExpired,
  remainingMs,
  sha256Hex,
  type InvoicePaid,
  type PayPhase,
} from "../../pay";
import { payApi, X_HANDLE, X_URL } from "../config";
import { copyText, formatCountdown } from "../lib/dom";
import { WalletBar } from "./WalletBar";
import {
  clearPaySession,
  emitPayNotice,
  getPaySession,
  patchPaySession,
  subscribePay,
} from "./store";

const WATCH_MS = 5_000;
const DEMO_BURN_MS = 1_600;
const STEPS: PayPhase[] = ["waiting", "paid", "burning", "done"];

function shorten(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function stepLabel(phase: PayPhase): string {
  if (phase === "waiting") return "Waiting";
  if (phase === "paid") return "Paid";
  if (phase === "burning") return "Burning";
  return "Done";
}

function watcherCopy(source: "api" | "demo" | "offline"): string {
  if (source === "api") {
    return "Tokens go to a fresh per-order receive wallet, then are burned. Supply goes down.";
  }
  if (source === "demo") {
    return "Demo receive address — pay watcher not connected. Do not send funds you cannot lose.";
  }
  return "Pay watcher not connected. No live receive address. Do not send tokens.";
}

export function PayPanel(): JSX.Element {
  const session = usePaySession();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    if (invoiceIsExpired(session.invoice, now) && session.phase === "waiting") {
      clearPaySession();
      emitPayNotice("Invoice expired. Get a new one. Do not send to the old receive address.");
    }
  }, [session, now]);

  useEffect(() => {
    if (!session || session.phase !== "waiting") return;
    if (!canSend(session.invoice)) return;

    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const hit = await findInboundTokens(session.invoice, {
          rpc: connection.rpcEndpoint,
          decimals: session.mintMeta.decimals,
          programId: session.mintMeta.programId,
        });
        if (!hit || cancelled) return;
        patchPaySession({
          payment: hit,
          phase: "paid",
          sendSig: session.sendSig ?? hit.signature,
        });
      } catch {
        // Public RPC can throttle. Keep waiting until the invoice expires.
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, WATCH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session, connection.rpcEndpoint]);

  useEffect(() => {
    if (session?.phase !== "paid") return;
    patchPaySession({ phase: "burning" });
  }, [session?.phase]);

  useEffect(() => {
    if (!session || session.phase !== "burning" || !session.payment) return;

    let cancelled = false;
    const api = payApi();

    const finish = async (burnSignature: string): Promise<void> => {
      if (cancelled || !session.payment) return;
      const postTextHash = await sha256Hex(session.draft);
      const paid: InvoicePaid = {
        type: "invoice.paid",
        invoiceId: session.invoice.invoiceId,
        orderId: session.invoice.orderId,
        amountTokens: session.invoice.amountTokens,
        mint: session.invoice.mint,
        fromPubkey: session.payment.fromPubkey || publicKey?.toBase58() || "",
        signature: session.payment.signature,
        burnSignature,
        paidAt: Date.now(),
        postText: session.draft,
        postTextHash,
      };
      patchPaySession({ phase: "done", paid });
    };

    const pollBurn = async (): Promise<boolean> => {
      if (api) {
        const status = await fetchInvoiceStatus(api, session.invoice.invoiceId);
        if (status?.burnSignature) {
          await finish(status.burnSignature);
          return true;
        }
      }
      const sig = await findBurnSignature(session.invoice, {
        rpc: connection.rpcEndpoint,
        decimals: session.mintMeta.decimals,
        programId: session.mintMeta.programId,
      });
      if (sig) {
        await finish(sig);
        return true;
      }
      return false;
    };

    void pollBurn();

    if (session.invoice.source !== "api") {
      const timer = window.setTimeout(() => {
        void finish("");
      }, DEMO_BURN_MS);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    const timer = window.setInterval(() => {
      void pollBurn();
    }, WATCH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session, connection.rpcEndpoint, publicKey]);

  async function sendTokens(): Promise<void> {
    if (!session || !publicKey || sending) return;
    if (!canSend(session.invoice)) return;
    setSending(true);
    patchPaySession({ error: null });
    try {
      const tx = await buildExactTokenTransfer({
        connection,
        from: publicKey,
        invoice: session.invoice,
        mintMeta: session.mintMeta,
      });
      const signature = await sendTransaction(tx, connection);
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      patchPaySession({ sendSig: signature });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transfer failed.";
      patchPaySession({ error: message });
    } finally {
      setSending(false);
    }
  }

  const amount = formatTokenAmount(session?.invoice.amountTokens ?? DEFAULT_TOKEN_AMOUNT);

  if (!session) {
    return (
      <div className="quote-card">
        <p className="eyebrow">Pay</p>
        <p className="quote-empty">
          Price is exactly {amount} tokens. Connect a wallet, then send that amount to a fresh
          per-order receive address. Those tokens are burned. Supply goes down.
        </p>
        <WalletBar />
      </div>
    );
  }

  const { invoice, phase, payment, paid } = session;
  const expired = invoiceIsExpired(invoice, now) && phase === "waiting";
  const sendable = canSend(invoice) && connected && phase === "waiting" && !expired;

  return (
    <div className="quote-card">
      <p className="eyebrow">Invoice</p>
      <p className="quote-amount">
        {amount} tokens
      </p>
      <p className="muted">
        {phase === "done"
          ? "Done"
          : expired
            ? "Expired"
            : `${formatCountdown(remainingMs(invoice, now))} remaining`}
      </p>

      <ol className="pay-steps">
        {STEPS.map((step) => (
          <li
            key={step}
            className={
              step === phase ? "is-current" : STEPS.indexOf(step) < STEPS.indexOf(phase) ? "is-done" : ""
            }
          >
            {stepLabel(step)}
          </li>
        ))}
      </ol>

      <p className="notice">{watcherCopy(invoice.source)}</p>

      <dl className="quote-dl">
        <dt>Post</dt>
        <dd>{session.draft}</dd>
        <dt>Mint</dt>
        <dd title={invoice.mint}>{shorten(invoice.mint)}</dd>
        <dt>Decimals</dt>
        <dd>{session.mintMeta.decimals}</dd>
        <dt>Receive</dt>
        <dd title={invoice.receivePubkey || "none"}>
          {invoice.receivePubkey ? shorten(invoice.receivePubkey) : "—"}
        </dd>
        {invoice.source === "demo" ? (
          <>
            <dt>Mode</dt>
            <dd>Demo · watcher offline</dd>
          </>
        ) : null}
      </dl>

      <WalletBar />

      {session.error ? <p className="notice">{session.error}</p> : null}

      <div className="quote-actions">
        {invoice.receivePubkey ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void (async () => {
                const ok = await copyText(invoice.receivePubkey);
                setCopied(ok);
                window.setTimeout(() => setCopied(false), 1400);
              })();
            }}
          >
            {copied ? "Copied" : "Copy receive"}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!sendable || sending}
          onClick={() => {
            void sendTokens();
          }}
        >
          {sending ? "Sending" : `Send ${amount} tokens`}
        </button>
        {phase !== "done" ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearPaySession();
              emitPayNotice("Invoice cancelled. Draft is unlocked.");
            }}
          >
            Cancel invoice
          </button>
        ) : null}
      </div>

      <div className="status-box">
        <p className="eyebrow">Status link</p>
        {phase === "done" ? (
          <p>
            Posting is still mocked until the X API is wired. When it is live, the tweet URL
            appears here — never in the tweet. Follow{" "}
            <a href={X_URL} rel="noopener noreferrer">
              {X_HANDLE}
            </a>
            .
            {paid?.signature ? ` Payment ${shorten(paid.signature)}.` : ""}
            {paid?.burnSignature ? ` Burn ${shorten(paid.burnSignature)}.` : ""}
          </p>
        ) : phase === "burning" ? (
          <p>Payment seen. Burning {amount} tokens. Real SPL / Token-2022 burn — supply goes down.</p>
        ) : phase === "paid" || payment ? (
          <p>Inbound {amount} seen on the receive ATA.</p>
        ) : (
          <p className="muted">The tweet URL appears here after the post — not in the tweet.</p>
        )}
      </div>
    </div>
  );
}

function usePaySession() {
  const [session, setSession] = useState(getPaySession);
  useEffect(() => subscribePay(() => setSession(getPaySession())), []);
  return session;
}
