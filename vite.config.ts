import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { apiPlugin } from "./vite.api";
import { sourceCatalogPlugin } from "./vite.source";

function rewritePostUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const [path, query] = url.split("?");
  if (path !== "/post" && path !== "/post/") return url;
  return query ? `/index.html?${query}` : "/index.html";
}

/** Serve /post/ as the SPA and emit dist/post/index.html for Netlify. */
function postPagePlugin(): Plugin {
  return {
    name: "post-page",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewritePostUrl(req.url) ?? req.url;
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewritePostUrl(req.url) ?? req.url;
        next();
      });
    },
    closeBundle() {
      const html = readFileSync(join("dist", "index.html"), "utf8");
      mkdirSync(join("dist", "post"), { recursive: true });
      writeFileSync(join("dist", "post", "index.html"), html);
    },
  };
}

export default defineConfig({
  base: "/",
  appType: "spa",
  plugins: [sourceCatalogPlugin(), apiPlugin(), postPagePlugin()],
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: [
      "@solana/web3.js",
      "@solana/spl-token",
      "@solana/wallet-adapter-base",
      "@solana/wallet-adapter-phantom",
      "@solana/wallet-adapter-solflare",
      "buffer",
    ],
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
