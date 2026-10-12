import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { root } from "../scripts/go.mjs";

// Native toolbar popups are CDP "other" targets, not Playwright tab pages.
class Popup {
  #cdp;
  #session;
  #nextId = 0;
  #pending = new Map();
  #listener;

  constructor(cdp, session, target) {
    this.#cdp = cdp;
    this.#session = session;
    this.target = target;
    this.#listener = event => {
      if (event.sessionId !== session) return;
      const response = JSON.parse(event.message);
      const pending = this.#pending.get(response.id);
      if (!pending) return;
      this.#pending.delete(response.id);
      clearTimeout(pending.timer);
      if (response.error) pending.reject(new Error(response.error.message));
      else pending.resolve(response.result);
    };
    cdp.on("Target.receivedMessageFromTarget", this.#listener);
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.#nextId;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Popup command timed out: ${method}`));
      }, 10_000);
      this.#pending.set(id, { resolve, reject, timer });
      this.#cdp.send("Target.sendMessageToTarget", {
        sessionId: this.#session, message: JSON.stringify({ id, method, params }),
      }).catch(error => {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      });
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || "Popup evaluation failed");
    return response.result.value;
  }

  async waitFor(expression) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (await this.evaluate(expression)) return;
      await delay(50);
    }
    throw new Error(`Popup did not reach expected state: ${expression}\n${await this.evaluate("document.body.innerText")}`);
  }

  async click() {
    const point = await this.evaluate(`(() => {
      const r = document.getElementById('copy-button').getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    })()`);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  }

  async screenshot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(root, "test-results", name), Buffer.from(data, "base64"));
  }

  async close() {
    this.#cdp.off("Target.receivedMessageFromTarget", this.#listener);
    await this.#cdp.send("Target.closeTarget", { targetId: this.target });
  }
}

async function openPopup(cdp, id, page) {
  await page.bringToFront();
  const { targetInfos: tabs } = await cdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] });
  const tab = tabs.find(target => target.url === page.url());
  assert.ok(tab, "Chrome tab target must exist");
  const before = new Set((await cdp.send("Target.getTargets")).targetInfos.map(target => target.targetId));
  await cdp.send("Extensions.triggerAction", { id, targetId: tab.targetId });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const target = targetInfos.find(target => target.type === "other" && !before.has(target.targetId));
    if (target) {
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: false });
      const popup = new Popup(cdp, sessionId, target.targetId);
      await popup.waitFor(`document.readyState === 'complete' && location.href === ${JSON.stringify(`chrome-extension://${id}/popup.html`)}`);
      return popup;
    }
    await delay(50);
  }
  throw new Error(`Chrome did not open the native extension popup: ${JSON.stringify((await cdp.send("Target.getTargets")).targetInfos)}`);
}

const fixture = `<!doctype html><html><head><title>Course fixture</title>
<base href="/course/unit/"><style>body { color: #123; }</style></head><body>
<nav>Course navigation</nav><main><h1>Résumé 学习</h1><p><strong>Important</strong> <a href="../lesson#part">Lesson</a></p>
<ul><li>Parent<ul><li>Child</li></ul></li><li><input id="task" type="checkbox">Done</li></ul>
<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>2</td></tr></table>
<pre><code class="language-js"><div>const x = 1;</div><div class="line-numbers">99</div><div>run(x);</div></code></pre>
<img src="images/chart.svg" alt="Chart"><p><del>Old</del> <code>a ** b</code></p></main>
<script>document.querySelector('#task').checked = true; document.querySelector('main').insertAdjacentHTML('beforeend', '<p>Live content ✓</p>');</script>
</body></html>`;

const lesson = `<!doctype html><html><head><title>Sandboxes and LocalShell</title>
<base href="/lessons/unit/"><style>.inactive { display: none; }</style></head><body>
<h1>Sandboxes and LocalShell</h1><p>A sandbox is a temporary, isolated workspace.</p>
<p><strong>Sandbox as a Tool:</strong> The agent runs outside and calls the sandbox via <code>execute</code>.</p>
<h2>Managing credentials in a sandbox</h2><p><a href="../reference">Lesson reference</a></p>
<div id="python"><pre><code class="language-python">print("Python lesson")</code></pre></div>
<div id="typescript" class="inactive"><pre><code class="language-typescript">console.log("TypeScript lesson");</code></pre></div>
<img hidden src="/tracking.svg" alt="Tracking pixel"><script>document.body.insertAdjacentHTML('beforeend', '<p>Live lesson content ✓</p>');</script>
</body></html>`;

function courseShell(src) {
  return `<!doctype html><html><head><title>Academy course</title></head><body>
  <aside style="width:20vw;float:left"><h1>Course menu</h1><ul><li>Lesson 1</li><li>Lesson 2</li></ul></aside>
  <iframe title="Lesson" style="width:75vw;height:85vh;border:0" src="${src}"></iframe>
  <iframe hidden src="http://ungranted.invalid/tracker"></iframe></body></html>`;
}

const server = createServer((request, response) => {
  if (request.url.endsWith(".svg")) {
    response.setHeader("Content-Type", "image/svg+xml");
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  } else {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    if (request.url === "/empty") response.end("<!doctype html><html><head><title>Empty</title></head><body></body></html>");
    else if (request.url === "/lesson") response.end(lesson);
    else if (request.url === "/course-frame") response.end(courseShell("/lesson"));
    else if (request.url === "/external-frame") response.end(courseShell(`http://localhost:${server.address().port}/lesson`));
    else if (request.url === "/external-empty") response.end(courseShell(`http://localhost:${server.address().port}/empty`));
    else response.end(fixture);
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
mkdirSync(join(root, "test-results"), { recursive: true });
let browser;
let context;
let brokenExtension;
let grantedExtension;

try {
  context = await chromium.launchPersistentContext("", {
    channel: "chrome", headless: false,
    permissions: ["clipboard-read", "clipboard-write"],
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
  });
  browser = context.browser();
  console.log(`Testing native extension popup in Chrome ${browser.version()}`);
  const cdp = await browser.newBrowserCDPSession();
  let { id } = await cdp.send("Extensions.loadUnpacked", { path: root });
  const page = await context.newPage();
  await page.goto(`${origin}/course/unit/page`);
  const before = await page.evaluate(() => document.documentElement.outerHTML);
  let popup = await openPopup(cdp, id, page);
  await popup.waitFor("!document.getElementById('copy-button').disabled");
  await popup.screenshot("popup-ready.png");
  const coldStart = performance.now();
  await popup.click();
  await popup.waitFor("document.getElementById('copy-button').dataset.state === 'copied'");
  const coldMs = performance.now() - coldStart;
  await popup.screenshot("popup-copied.png");
  assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before, "Capture must not mutate the live page");
  const updated = await page.evaluate(() => {
    document.querySelector("main").insertAdjacentHTML("beforeend", "<p>Updated after first copy</p>");
    return document.documentElement.outerHTML;
  });
  const warmStart = performance.now();
  await popup.click();
  await popup.waitFor("document.getElementById('copy-button').dataset.state === 'copied'");
  const warmMs = performance.now() - warmStart;
  assert.equal(await popup.evaluate("document.documentElement.scrollWidth > document.body.clientWidth"), false);
  await popup.close();
  await page.bringToFront();
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  for (const expected of [
    "# Résumé 学习", "**Important**", `[Lesson](${origin}/course/lesson#part)`,
    "- Parent\n  - Child", "[x] Done", "| Name | Value |", "| A | 2 |",
    "```js\nconst x = 1;\nrun(x);\n```", `![Chart](${origin}/course/unit/images/chart.svg)`,
    "~~Old~~ `a ** b`", "Live content ✓", "Course navigation", "Updated after first copy",
  ]) assert.ok(markdown.includes(expected), `Missing Markdown content: ${expected}\n${markdown}`);
  assert.ok(!/^99$/m.test(markdown) && !markdown.includes("insertAdjacentHTML") && !markdown.includes("color: #123"));
  assert.equal(await page.evaluate(() => document.documentElement.outerHTML), updated, "Repeated capture must not mutate the live page");
  writeFileSync(join(root, "test-results", "copied.md"), markdown);
  console.log(`PASS: real action → live DOM → WASM → clipboard; cold click ${coldMs.toFixed(0)} ms, warm click ${warmMs.toFixed(0)} ms (includes test polling)`);

  await page.goto(`${origin}/course-frame`);
  const lessonFrame = page.frames().find(frame => frame.url().endsWith("/lesson"));
  assert.ok(lessonFrame);
  const lessonBefore = await lessonFrame.evaluate(() => document.documentElement.outerHTML);
  popup = await openPopup(cdp, id, page);
  await popup.waitFor("!document.getElementById('copy-button').disabled");
  await popup.click();
  await popup.waitFor("document.getElementById('copy-button').dataset.state === 'copied'");
  await popup.close();
  await page.bringToFront();
  const lessonMarkdown = await page.evaluate(() => navigator.clipboard.readText());
  for (const text of ["# Sandboxes and LocalShell", "A sandbox is a temporary", "Managing credentials", "Live lesson content ✓", 'print("Python lesson")', `[Lesson reference](${origin}/lessons/reference)`]) {
    assert.ok(lessonMarkdown.includes(text), `Missing embedded lesson content: ${text}\n${lessonMarkdown}`);
  }
  for (const text of ["Course menu", "TypeScript lesson", "Tracking pixel"]) assert.ok(!lessonMarkdown.includes(text));
  assert.equal(await lessonFrame.evaluate(() => document.documentElement.outerHTML), lessonBefore);
  console.log("PASS: dominant same-origin lesson is copied without menu, inactive tab, or hidden pixels");

  await page.goto(`${origin}/external-frame`);
  await page.evaluate(() => navigator.clipboard.writeText("Keep existing clipboard"));
  popup = await openPopup(cdp, id, page);
  await popup.waitFor("!document.getElementById('copy-button').disabled");
  await popup.click();
  await popup.waitFor("document.getElementById('button-label').textContent === 'Allow lesson access'");
  await popup.screenshot("popup-embedded-access.png");
  assert.equal(await popup.evaluate("navigator.clipboard.readText()"), "Keep existing clipboard");
  // Exercise denial while keeping the normal request method for the actual grant.
  await popup.evaluate("window.originalRequest = chrome.permissions.request; chrome.permissions.request = async () => false");
  await popup.click();
  await popup.waitFor("document.getElementById('status-detail').textContent.includes(\"wasn't granted\")");
  assert.equal(await popup.evaluate("navigator.clipboard.readText()"), "Keep existing clipboard");
  await popup.evaluate("chrome.permissions.request = window.originalRequest");
  await popup.close();
  // Use a test-only build with localhost access declared at install time.
  // Chrome's native optional-host permission prompt is outside the page CDP target.
  grantedExtension = mkdtempSync(join(tmpdir(), "clipmd-granted-host-"));
  for (const file of ["manifest.json", "popup.html", "popup.css", "popup.js", "capture.js", "markdown-converter.js", "converter-worker.js", "icons", "wasm"]) {
    cpSync(join(root, file), join(grantedExtension, file), { recursive: true });
  }
  const manifest = JSON.parse(readFileSync(join(grantedExtension, "manifest.json"), "utf8"));
  delete manifest.optional_host_permissions;
  manifest.host_permissions = ["http://localhost/*"];
  writeFileSync(join(grantedExtension, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  ({ id } = await cdp.send("Extensions.loadUnpacked", { path: grantedExtension }));
  popup = await openPopup(cdp, id, page);
  await popup.waitFor("!document.getElementById('copy-button').disabled");
  await popup.click();
  await popup.waitFor("document.getElementById('copy-button').dataset.state === 'copied'");
  assert.equal(await popup.evaluate("chrome.permissions.contains({origins:['http://localhost/*']})"), true);
  await popup.screenshot("popup-embedded-copied.png");
  assert.equal(await popup.evaluate("document.documentElement.scrollWidth > document.body.clientWidth"), false);
  await popup.close();
  await page.bringToFront();
  const externalMarkdown = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(externalMarkdown.includes("A sandbox is a temporary"));
  assert.ok(externalMarkdown.includes(`http://localhost:${server.address().port}/lessons/reference`));
  assert.ok(!externalMarkdown.includes("Course menu"));
  writeFileSync(join(root, "test-results", "embedded-lesson.md"), externalMarkdown);
  const externalLesson = page.frames().find(frame => frame.url().endsWith("/lesson"));
  await externalLesson.evaluate(() => {
    document.getElementById("python").classList.add("inactive");
    document.getElementById("typescript").classList.remove("inactive");
  });
  popup = await openPopup(cdp, id, page);
  await popup.waitFor("!document.getElementById('copy-button').disabled");
  await popup.click();
  await popup.waitFor("document.getElementById('copy-button').dataset.state === 'copied'");
  await popup.close();
  await page.bringToFront();
  const switched = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(switched.includes("TypeScript lesson") && !switched.includes("Python lesson"));
  console.log("PASS: cross-origin lesson access, denial preserves clipboard, grant copies live content, and selected tab is respected");

  await page.goto(`${origin}/external-empty`);
  await page.evaluate(() => navigator.clipboard.writeText("Keep existing clipboard"));
  popup = await openPopup(cdp, id, page);
  await popup.waitFor("!document.getElementById('copy-button').disabled");
  await popup.click();
  await popup.waitFor("document.getElementById('status-detail').textContent.includes('no text to convert')");
  await popup.close();
  await page.bringToFront();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Keep existing clipboard");
  console.log("PASS: empty embedded lesson never silently copies the menu");

  await page.goto(`${origin}/empty`);
  await page.evaluate(() => navigator.clipboard.writeText("Keep existing clipboard"));
  popup = await openPopup(cdp, id, page);
  await popup.waitFor("!document.getElementById('copy-button').disabled");
  await popup.click();
  await popup.waitFor("document.getElementById('status-detail').textContent.includes('no text to convert')");
  await popup.screenshot("popup-empty.png");
  assert.equal(await popup.evaluate("document.getElementById('button-label').textContent"), "Try again");
  await popup.close();
  await page.bringToFront();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Keep existing clipboard");
  console.log("PASS: empty page reports an error and preserves the clipboard");

  await page.goto("chrome://version");
  popup = await openPopup(cdp, id, page);
  await popup.waitFor("document.getElementById('button-label').textContent === 'Unavailable here'");
  assert.equal(await popup.evaluate("document.getElementById('copy-button').disabled"), true);
  await popup.screenshot("popup-protected.png");
  await popup.close();
  console.log("PASS: protected Chrome page remains disabled");

  // A missing packaged module must fail visibly and never fall back to copying HTML.
  brokenExtension = mkdtempSync(join(tmpdir(), "clipmd-missing-wasm-"));
  for (const file of ["manifest.json", "popup.html", "popup.css", "popup.js", "capture.js", "markdown-converter.js", "converter-worker.js", "icons"]) {
    cpSync(join(root, file), join(brokenExtension, file), { recursive: true });
  }
  mkdirSync(join(brokenExtension, "wasm"));
  cpSync(join(root, "wasm/wasm_exec.js"), join(brokenExtension, "wasm/wasm_exec.js"));
  const { id: brokenId } = await cdp.send("Extensions.loadUnpacked", { path: brokenExtension });
  await page.goto(`${origin}/course/unit/page`);
  await page.evaluate(() => navigator.clipboard.writeText("Keep existing clipboard"));
  popup = await openPopup(cdp, brokenId, page);
  await popup.waitFor("!document.getElementById('copy-button').disabled");
  for (let attempt = 0; attempt < 2; attempt++) {
    await popup.click();
    await popup.waitFor("document.getElementById('status-detail').textContent.includes('could not load')");
    assert.equal(await popup.evaluate("document.getElementById('copy-button').disabled"), false);
  }
  await popup.screenshot("popup-missing-module.png");
  await popup.close();
  await page.bringToFront();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Keep existing clipboard");
  console.log("PASS: missing WASM module reports a load error, permits retry, and preserves the clipboard");
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
  if (brokenExtension) rmSync(brokenExtension, { recursive: true, force: true });
  if (grantedExtension) rmSync(grantedExtension, { recursive: true, force: true });
}
