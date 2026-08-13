import { defineConfig } from "vite";
import { apiPlugin } from "./vite.api";
import { sourceCatalogPlugin } from "./vite.source";

export default defineConfig({
  base: "./",
  plugins: [sourceCatalogPlugin(), apiPlugin()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
