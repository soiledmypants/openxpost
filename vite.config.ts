import { defineConfig } from "vite";
import { apiPlugin } from "./vite.api";
import { sourceCatalogPlugin } from "./vite.source";

export default defineConfig({
  base: "./",
  plugins: [sourceCatalogPlugin(), apiPlugin()],
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["@solana/web3.js", "@solana/spl-token", "buffer"],
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
