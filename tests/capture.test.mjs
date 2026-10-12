import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chromium } from "playwright";
import { capturePage } from "../capture.js";

// Exercise the shipped Firecrawl converter as well as the browser snapshot.
globalThis.postMessage = () => {};
await import("../wasm/wasm_exec.js");
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(readFileSync(new URL("../wasm/converter.wasm", import.meta.url)), go.importObject);
void go.run(instance);

const feed = `<!doctype html><style>.inline {display:inline} .hidden {display:none}</style>
<nav>Home Explore</nav><main><div>What's happening? Post</div>
<article data-testid="tweet">
<div data-testid="User-Name"><div><a href="/jai">Jai</a></div><div><a href="/jai">@jai</a> · <a href="/jai/status/1"><time>2m</time></a></div></div>
<div data-testid="tweetText">So I compiled <div class="inline"><a href="/firecrawl">@firecrawl</a></div>'s tool.<br>Here is ClipMD.</div>
<div data-testid="tweetPhoto"><a href="/jai/status/1/photo/1"><img src="/photo.jpg" alt="Screenshot"></a></div>
<div role="group">364 658 5.5K</div><div class="hidden">Hidden text</div></article>
<article data-testid="tweet"><div data-testid="User-Name"><a href="/brian">Brian</a> <a href="/brian/status/2"><time>11h</time></a></div>
<div data-testid="tweetText">We'll see more inside</div><button data-testid="tweet-text-show-more-link">Show more</button>
<div role="link"><div data-testid="User-Name">Gokul @gokul</div><div data-testid="tweetText">Quoted post</div></div></article>
</main><aside>Upgrade to Premium+ Who to follow</aside>`;

test("X feed capture produces coherent posts without chrome, preserves quotes and media, and leaves iframe lessons intact", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://x.com/**", route => route.fulfill({ contentType: "text/html", body: feed }));
    await page.goto("https://x.com/home");
    const before = await page.content();
    const captured = await page.evaluate(capturePage);
    const { markdown, error } = globalThis.clipmdConvert(captured.html, captured.baseURL);
    assert.equal(error, undefined);
    assert.ok(markdown.includes("So I compiled [@firecrawl](https://x.com/firecrawl)'s tool."), markdown);
    assert.ok(markdown.includes("## [Jai](https://x.com/jai)"), markdown);
    assert.ok(markdown.includes("https://x.com/jai/status/1"), markdown);
    assert.ok(markdown.includes("![Screenshot](https://x.com/photo.jpg)"), markdown);
    assert.ok(markdown.includes("> Quoted post"), markdown);
    assert.ok(markdown.includes("Post is truncated"), markdown);
    for (const clutter of ["Home Explore", "What's happening?", "Upgrade to Premium+", "Who to follow", "364", "Hidden text"]) {
      assert.ok(!markdown.includes(clutter), markdown);
    }
    assert.equal(await page.content(), before, "Capture must not mutate X");
    assert.equal(captured.embedded, undefined);

    // Other sites keep their content, even if they reuse X's test IDs.
    await page.route("https://example.com/**", route => route.fulfill({ contentType: "text/html", body: feed }));
    await page.goto("https://example.com/");
    const ordinary = await page.evaluate(capturePage);
    assert.ok(ordinary.html.includes("Home Explore"));

    await page.setContent(`<aside>Course menu</aside><iframe style="width:95vw;height:95vh" srcdoc="<h1>Lesson</h1><p>Embedded lesson content</p>"></iframe>`);
    await page.locator("iframe").contentFrame().locator("h1").waitFor();
    const lesson = await page.evaluate(capturePage);
    assert.ok(lesson.html.includes("Embedded lesson content"));
    assert.ok(!lesson.html.includes("Course menu"));
  } finally {
    await browser.close();
  }
});
