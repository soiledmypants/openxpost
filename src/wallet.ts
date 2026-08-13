import { WalletReadyState, type Adapter } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { Connection, PublicKey, type Transaction } from "@solana/web3.js";
import { solanaRpc } from "./config";

let adapters: Adapter[] | null = null;
let current: Adapter | null = null;
const listeners = new Set<() => void>();

function list(): Adapter[] {
  if (!adapters) {
    adapters = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
  }
  return adapters;
}

function emit(): void {
  for (const fn of listeners) fn();
}

function bindAdapter(wallet: Adapter): void {
  wallet.off("disconnect", onAdapterDisconnect);
  wallet.on("disconnect", onAdapterDisconnect);
}

function onAdapterDisconnect(): void {
  current = null;
  emit();
}

export function onWalletChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function availableWallets(): { name: string; ready: boolean }[] {
  return list().map((wallet) => ({
    name: wallet.name,
    ready:
      wallet.readyState === WalletReadyState.Installed ||
      wallet.readyState === WalletReadyState.Loadable,
  }));
}

export function connectedPubkey(): string | null {
  const key = current?.publicKey;
  return key ? key.toBase58() : null;
}

export function shortenPubkey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function connectWallet(name?: string): Promise<string> {
  const wallets = list();
  const pick =
    (name ? wallets.find((wallet) => wallet.name === name) : undefined) ??
    wallets.find(
      (wallet) =>
        wallet.readyState === WalletReadyState.Installed ||
        wallet.readyState === WalletReadyState.Loadable,
    ) ??
    wallets[0];
  if (!pick) {
    throw new Error("No Solana wallet found. Install Phantom or Solflare.");
  }
  if (current && current !== pick) {
    try {
      await current.disconnect();
    } catch {
      /* ignore */
    }
  }
  bindAdapter(pick);
  await pick.connect();
  current = pick;
  const key = pick.publicKey;
  if (!key) {
    throw new Error("Wallet connected without a public key.");
  }
  emit();
  void prefetchLatestBlockhash();
  return key.toBase58();
}

/** Warm /api/rpc after connect so Pay's getLatestBlockhash is ready. */
function prefetchLatestBlockhash(): Promise<void> {
  const connection = new Connection(solanaRpc(), "confirmed");
  return connection
    .getLatestBlockhash("confirmed")
    .then(() => undefined)
    .catch(() => undefined);
}

export async function disconnectWallet(): Promise<void> {
  if (current) {
    try {
      await current.disconnect();
    } catch {
      /* ignore */
    }
  }
  current = null;
  emit();
}

export async function signAndSend(transaction: Transaction): Promise<string> {
  if (!current?.publicKey) {
    throw new Error("Connect Phantom or Solflare first.");
  }
  const connection = new Connection(solanaRpc(), "confirmed");
  const sig = await current.sendTransaction(transaction, connection, {
    skipPreflight: false,
  });
  return typeof sig === "string" ? sig : String(sig);
}

export function walletPublicKey(): PublicKey {
  if (!current?.publicKey) {
    throw new Error("Connect Phantom or Solflare first.");
  }
  return current.publicKey;
}
