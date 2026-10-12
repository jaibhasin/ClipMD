/* global Go */
importScripts("wasm/wasm_exec.js");

async function start() {
  try {
    const go = new Go();
    const response = await fetch("wasm/converter.wasm");
    if (!response.ok) throw new Error("Missing converter module");
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
    go.run(instance).catch(() => {
      postMessage({ type: "error", error: "The Markdown converter stopped. Try again." });
    });
  } catch {
    postMessage({ type: "error", error: "The Markdown converter could not load. Reload the extension and try again." });
  }
}

onmessage = ({ data }) => {
  if (data.type !== "convert") return;
  try {
    const result = globalThis.clipmdConvert(data.html, data.baseURL);
    postMessage({ type: "result", id: data.id, ...result });
  } catch {
    postMessage({ type: "result", id: data.id, error: "This page could not be converted." });
  }
};

start();
