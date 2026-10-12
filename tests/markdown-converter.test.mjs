import assert from "node:assert/strict";
import test from "node:test";
import { MarkdownConverter, ConversionError } from "../markdown-converter.js";

class TestWorker {
  static instances = [];
  constructor() {
    this.requests = [];
    TestWorker.instances.push(this);
  }
  postMessage(request) { this.requests.push(request); }
  terminate() { this.terminated = true; }
  reply(data) { this.onmessage({ data }); }
}

globalThis.Worker = TestWorker;

test("waits for initialization and matches concurrent results by request ID", async () => {
  const converter = new MarkdownConverter();
  const first = converter.convert("<h1>First</h1>", "https://example.com/");
  const second = converter.convert("<h1>Second</h1>", "https://example.com/");
  const worker = TestWorker.instances.at(-1);
  assert.equal(worker.requests.length, 0);
  worker.reply({ type: "ready" });
  const [a, b] = worker.requests;
  assert.equal(a.html, "<h1>First</h1>");
  worker.reply({ type: "result", id: b.id, markdown: "# Second" });
  worker.reply({ type: "result", id: a.id, markdown: "# First" });
  assert.deepEqual(await Promise.all([first, second]), ["# First", "# Second"]);
  converter.dispose();
});

test("reports empty conversions instead of copying an empty clipboard", async () => {
  const converter = new MarkdownConverter();
  const conversion = converter.convert("<body></body>", "https://example.com/");
  const worker = TestWorker.instances.at(-1);
  worker.reply({ type: "ready" });
  worker.reply({ type: "result", id: worker.requests[0].id, markdown: " " });
  await assert.rejects(conversion, /no text to convert/);
  converter.dispose();
});

test("a crashed worker rejects all waiting requests and is replaced on retry", async () => {
  const converter = new MarkdownConverter();
  const first = converter.convert("<p>One</p>", "https://example.com/");
  const second = converter.convert("<p>Two</p>", "https://example.com/");
  const failed = TestWorker.instances.at(-1);
  failed.onerror({ preventDefault() {} });
  await Promise.all([assert.rejects(first, ConversionError), assert.rejects(second, ConversionError)]);
  assert.equal(failed.terminated, true);
  const retry = converter.convert("<p>Retry</p>", "https://example.com/");
  const replacement = TestWorker.instances.at(-1);
  assert.notEqual(replacement, failed);
  replacement.reply({ type: "ready" });
  replacement.reply({ type: "result", id: replacement.requests[0].id, markdown: "Retry" });
  assert.equal(await retry, "Retry");
  converter.dispose();
});

test("a stalled worker times out and terminates", async () => {
  const converter = new MarkdownConverter({ timeout: 10 });
  const conversion = converter.convert("<p>Text</p>", "https://example.com/");
  const worker = TestWorker.instances.at(-1);
  await assert.rejects(conversion, /too long/);
  assert.equal(worker.terminated, true);
});

test("closing the popup cancels pending conversion", async () => {
  const converter = new MarkdownConverter();
  const conversion = converter.convert("<p>Text</p>", "https://example.com/");
  converter.dispose();
  await assert.rejects(conversion, /cancelled/);
});
