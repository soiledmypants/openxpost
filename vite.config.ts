import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { sourceCatalogPlugin } from "./vite.source";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "process"],
      globals: { Buffer: true, global: true, process: true },
    }),
    sourceCatalogPlugin(),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
