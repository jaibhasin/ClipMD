import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sourceFiles(root) {
  return ["go.mod", "go.sum", ...["cmd/wasm", "internal/converter"].flatMap(directory =>
    readdirSync(join(root, directory), { recursive: true })
      .filter(file => file.endsWith(".go") && !file.endsWith("_test.go"))
      .map(file => `${directory}/${file.replaceAll("\\", "/")}`),
  )].sort();
}
