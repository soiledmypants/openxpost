/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOKEN_MINT?: string;
  readonly VITE_TOKEN_AMOUNT?: string;
  readonly VITE_SOLANA_RPC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:source-files" {
  export const files: { path: string; content: string }[];
}
