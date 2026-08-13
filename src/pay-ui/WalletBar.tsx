import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";
import { X_HANDLE, X_URL } from "../config";

function shorten(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function WalletBar(): JSX.Element {
  const { wallets, select, connect, disconnect, connected, connecting, publicKey, wallet } =
    useWallet();
  const [open, setOpen] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    if (!pending.current || !wallet) return;
    pending.current = false;
    void connect().catch(() => {
      /* user rejected or wallet missing */
    });
  }, [wallet, connect]);

  const listed = wallets
    .filter((item) => item.readyState !== WalletReadyState.Unsupported)
    .slice()
    .sort((a, b) => {
      const rank = (state: WalletReadyState): number => {
        if (state === WalletReadyState.Installed) return 0;
        if (state === WalletReadyState.Loadable) return 1;
        return 2;
      };
      return rank(a.readyState) - rank(b.readyState);
    });

  if (connected && publicKey) {
    return (
      <div className="wallet-bar">
        <span className="wallet-pk" title={publicKey.toBase58()}>
          {shorten(publicKey.toBase58())}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            void disconnect();
          }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-bar">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={connecting}
        onClick={() => setOpen((value) => !value)}
      >
        {connecting ? "Connecting" : "Connect wallet"}
      </button>
      {open ? (
        <div className="wallet-menu" role="listbox" aria-label="Wallets">
          {listed.length === 0 ? (
            <p className="muted">
              No wallet detected. Install Phantom or Solflare, or a wallet-standard wallet.
            </p>
          ) : (
            listed.map((item) => (
              <button
                key={item.adapter.name}
                type="button"
                className="wallet-item"
                onClick={() => {
                  pending.current = true;
                  setOpen(false);
                  select(item.adapter.name as WalletName);
                }}
              >
                {item.adapter.icon ? (
                  <img src={item.adapter.icon} alt="" width={18} height={18} />
                ) : null}
                <span>{item.adapter.name}</span>
              </button>
            ))
          )}
          <p className="wallet-note">
            Phantom, Solflare, and wallet-standard wallets. Posts go on{" "}
            <a href={X_URL} rel="noopener noreferrer">
              {X_HANDLE}
            </a>
            .
          </p>
        </div>
      ) : null}
    </div>
  );
}
