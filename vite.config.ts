import { defineConfig } from "vite";
import { sourceCatalogPlugin } from "./vite.source";

export default defineConfig({
  base: "./",
  plugins: [sourceCatalogPlugin()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
