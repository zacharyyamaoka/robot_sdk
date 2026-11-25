// Build every variant in turn (each is its own single-file output).
import { execFileSync } from "node:child_process";
for (const v of ["v1", "v2", "v3", "v4", "v5"]) {
  console.log("build", v);
  execFileSync("npx", ["vite", "build"], { stdio: "inherit", env: { ...process.env, VARIANT: v }, cwd: import.meta.dirname + "/.." });
}
