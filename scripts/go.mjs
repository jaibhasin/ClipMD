import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const goEnv = {
  ...process.env,
  GOCACHE: process.env.GOCACHE || resolve(root, ".cache/go-build"),
  GOMODCACHE: process.env.GOMODCACHE || resolve(root, ".cache/go-mod"),
};

export function runGo(args, options = {}) {
  mkdirSync(goEnv.GOCACHE, { recursive: true });
  mkdirSync(goEnv.GOMODCACHE, { recursive: true });
  return execFileSync("go", args, { cwd: root, env: goEnv, stdio: "inherit", ...options });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGo(process.argv.slice(2));
}
