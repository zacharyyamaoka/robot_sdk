// Build every variant in turn (each is its own single-file output).
import { execFileSync } from "node:child_process";
// Round 1 = v1..v5, round 2 = v6..v10 (2026-11-24); pass names to build a subset: node tools/build-all.mjs v6 v7
const all = ["v1", "v2", "v3", "v4", "v5", "kit", "v6", "v7", "v8", "v9", "v10"];
const pick = process.argv.slice(2);
for (const v of pick.length ? pick : all) {
  console.log("build", v);
  execFileSync("npx", ["vite", "build"], { stdio: "inherit", env: { ...process.env, VARIANT: v }, cwd: import.meta.dirname + "/.." });
}
