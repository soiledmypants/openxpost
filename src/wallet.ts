import { WalletReadyState, type Adapter } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { PublicKey, type Transaction } from "@solana/web3.js";

let adapters: Adapter[] | null = null;
let current: Adapter | null = null;

function list(): Adapter[] {
  if (!adapters) {
    adapters = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
  }
  return adapters;
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
  await pick.connect();
  current = pick;
  const key = pick.publicKey;
  if (!key) {
    throw new Error("Wallet connected without a public key.");
  }
  return key.toBase58();
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
}

export async function signAndSend(transaction: Transaction): Promise<string> {
  if (!current?.publicKey) {
    throw new Error("Connect Phantom or Solflare first.");
  }
  const { Connection } = await import("@solana/web3.js");
  const { solanaRpc } = await import("./config");
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
