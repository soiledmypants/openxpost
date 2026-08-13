import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import type { Adapter } from "@solana/wallet-adapter-base";
import { useMemo, type ComponentType, type ReactNode } from "react";

type ConnectionProps = {
  endpoint: string;
  config?: { commitment: "confirmed" };
  children: ReactNode;
};

type WalletProps = {
  wallets: Adapter[];
  autoConnect?: boolean;
  children: ReactNode;
};

const Connection = ConnectionProvider as ComponentType<ConnectionProps>;
const Wallets = WalletProvider as ComponentType<WalletProps>;

export function PayProviders({
  endpoint,
  children,
}: {
  endpoint: string;
  children: ReactNode;
}): JSX.Element {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );
  return (
    <Connection endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <Wallets wallets={wallets} autoConnect>
        {children}
      </Wallets>
    </Connection>
  );
}
