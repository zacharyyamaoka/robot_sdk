// One Vite config for all five variants: VARIANT=v3 npx vite build → v3/index.html, one self-contained file.
// WHY single-file: each prototype opens from file:// (inside the babble gallery's iframe) with the graph.json it was
// built with, and from any static server it re-reads ../../../site/data/graph.json at runtime (shared/data.js).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "node:path";

const variant = process.env.VARIANT;
if (!/^v[1-5]$/.test(variant || "")) throw new Error("set VARIANT=v1..v5");
const here = import.meta.dirname;

export default defineConfig({
  root: resolve(here, "src", variant),
  base: "./",
  plugins: [react(), viteSingleFile()],
  resolve: { alias: { "@shared": resolve(here, "src/shared"), "@repo": resolve(here, "../..") } },
  server: { fs: { allow: [resolve(here, "../..")] } },
  build: { outDir: resolve(here, variant), emptyOutDir: true, assetsInlineLimit: 100000000, chunkSizeWarningLimit: 4000 },
  logLevel: "warn",
});
