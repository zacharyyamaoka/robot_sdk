// One Vite config for every variant: VARIANT=v3 npx vite build → v3/index.html, one self-contained file.
// Round 2 (2026-11-24): v6..v10, plus VARIANT=kit (the shared workspace kit's demo page, src/kit/).
// WHY single-file: each prototype opens from file:// (inside the babble gallery's iframe) with the graph.json it was
// built with, and from any static server it re-reads ../../../site/data/graph.json at runtime (shared/data.js).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "node:path";

const variant = process.env.VARIANT;
if (!/^(v([1-9]|10)|kit)$/.test(variant || "")) throw new Error("set VARIANT=v1..v10 or kit");
const here = import.meta.dirname;

export default defineConfig({
  root: resolve(here, "src", variant),
  base: "./",
  plugins: [react(), viteSingleFile()],
  resolve: { alias: { "@shared": resolve(here, "src/shared"), "@kit": resolve(here, "src/kit"), "@repo": resolve(here, "../..") } },
  server: { fs: { allow: [resolve(here, "../..")] } },
  build: { outDir: resolve(here, variant), emptyOutDir: true, assetsInlineLimit: 100000000, chunkSizeWarningLimit: 4000 },
  logLevel: "warn",
});
