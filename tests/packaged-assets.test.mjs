import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { root } from "../scripts/go.mjs";
import { fileHash, sourceFiles } from "../scripts/asset-hashes.mjs";

test("packaged WASM and runtime correspond to the checked-in Go sources", () => {
  const build = JSON.parse(readFileSync(join(root, "wasm/build.json"), "utf8"));
  assert.deepEqual(Object.keys(build.sourceHashes).sort(), sourceFiles(root), "Go source set changed: run npm run build");
  for (const [file, expected] of Object.entries(build.sourceHashes)) {
    assert.equal(fileHash(join(root, file)), expected, `${file} changed: run npm run build`);
  }
  assert.equal(fileHash(join(root, "wasm/converter.wasm")), build.wasmHash, "Packaged WASM does not match the build record");
  assert.equal(fileHash(join(root, "wasm/wasm_exec.js")), build.runtimeHash, "Packaged Go runtime does not match the build record");
});
