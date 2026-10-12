# ClipMD

Giving your LLM context using a website URL doesn't work when the site requires a login or blocks access.

I ran into this while reading course material and wanting to talk to ChatGPT about it.
Sharing the URL wasn't enough, and taking screenshots every time was tedious.

So I compiled [Firecrawl's HTML-to-Markdown tool](https://github.com/firecrawl/html-to-markdown) into **WebAssembly (Wasm)** and created a Chrome extension.

Here is **ClipMD**.

> Open the page → copy as Markdown → paste into your AI chat.

<p align="center">
  <img src="docs/clipmd.png" alt="ClipMD extension with the Copy Markdown button and local processing notice" width="360">
</p>

## How you'd use it

You're reading a lesson, some documentation, or a page you had to log in to see.
You want to ask your LLM about what's on that page.

1. Open ClipMD and click **Copy Markdown**.
2. Paste it into ChatGPT, Claude, or whichever AI chat you use.
3. Ask your question with the page content already in the conversation.

**Runs locally in your browser.**
No account, API key, or conversion server needed.

## Get started

1. Download this repo using **Code → Download ZIP** and unzip it, or clone it:

   ```sh
   git clone https://github.com/jaibhasin/ClipMD.git
   ```

2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the downloaded `ClipMD` folder containing `manifest.json`.
5. Pin ClipMD using Chrome's extensions menu, then open a page and give it a try.

The WebAssembly module and matching Go runtime are included, so installation needs no build step or API key.
After changing extension files, click **Reload** on its card in `chrome://extensions`.
If you are working in a different checkout or worktree, load that folder as the unpacked extension.

## What gets copied

ClipMD reads the page already loaded in your browser and turns its HTML into Markdown.

- **Headings and formatting:** headings, bold, italics, and strikethrough.
- **Lists and tables:** nested lists, task checkboxes, and tables.
- **Code:** inline code and fenced code blocks.
- **Links and images:** links resolve to full URLs; images become Markdown references.
- **Live content:** text added by JavaScript and the current state of checkboxes.

The conversion uses a detached copy, so your page isn't changed.
Scripts, styles, and document metadata are left out.
If conversion fails or produces no text, your existing clipboard stays untouched.

## Current limits

This version keeps navigation and surrounding page text.
It does not automatically select an article or main content region.
Images remain Markdown references; their pixels are not copied or uploaded.
Some course sites put the lesson inside a separate embedded page (an iframe).
Support for these lessons is still being tested; if you get the menu instead of the lesson, open the embedded lesson in its own tab and copy from there.
Shadow roots, canvas text, PDFs, and office files need separate handling.
Complex merged tables, diagrams, and rendered equations may need additional conversion rules.
Only content already loaded in the page is included.

ClipMD works on ordinary HTTP and HTTPS pages.
Chrome's internal pages and the Chrome Web Store cannot be captured.

## Privacy and permissions

Capture, conversion, and copying happen locally.
ClipMD does not send page content to a server or store a copy of it.
Conversion runs in a dedicated worker so the popup stays responsive.
The popup must stay open until copying finishes.

| Permission | Purpose |
| --- | --- |
| `activeTab` | Access the current page after you open ClipMD. |
| `scripting` | Capture a detached copy of the page's current content. |
| `clipboardWrite` | Copy the resulting Markdown to your clipboard. |

The extension's content security policy allows packaged WebAssembly through `wasm-unsafe-eval`.
Scripts and resources remain restricted to the extension itself.

## For developers

<details>
<summary><strong>Converter, builds, tests, and project structure</strong></summary>

### Converter and builds

The converter is pinned to Firecrawl commit [`1af9901`](https://github.com/firecrawl/html-to-markdown/commit/1af9901a5d6101621120204f7ea3f5355fd5ea31).
It enables the upstream GitHub-Flavored Markdown and robust code-block plugins.
For inline code, it uses the upstream CommonMark rule to preserve spacing and safely handle long backtick sequences.
Full document URL resolution is supplied through the converter's supported options.
Relative links respect the document's `<base>` element.
Image references use the browser's selected image URL or an available `data-src` fallback.
There is no Turndown fallback or hosted conversion service.

To rebuild, install Node.js 22+ and Go 1.25+:

```sh
npm ci
npm run build
npm test
```

The first build downloads pinned Go dependencies.
The build compiles `wasm/converter.wasm`, copies `wasm_exec.js` from the same Go installation, and collects third-party licenses.
`wasm/build.json` records dependency versions and hashes of the source files, WASM module, and runtime.
Tests fail if packaged assets become stale after a Go source or dependency change.
Generated assets and license copies should be regenerated with `npm run build`.
The module is approximately 5.6 MB before compression.
First-use startup includes loading and compiling it; performance depends on page size and the device.

### Browser verification

With a recent desktop Google Chrome installed:

```sh
npm run test:browser
```

The browser test launches an isolated temporary regular Chrome profile and a loopback fixture server.
It opens the real toolbar popup and verifies live DOM capture, WASM conversion, clipboard contents, repeated capture, inline-code spacing, and source-page immutability.
It also checks empty pages, protected pages, and recovery when the packaged module is missing.
The test writes sample Markdown and popup screenshots into `test-results/` and replaces the system clipboard with test content.
Native popup automation uses experimental Chrome DevTools Protocol extension commands and was verified in Chrome 154.
Conversion correctness and worker lifecycle are also covered by `npm test`.

### Continuous integration

GitHub Actions runs on pushes and pull requests.
It checks JavaScript syntax, Go formatting and vet results, conversion tests, worker lifecycle tests, and the checked-in WASM asset hashes.
It then rebuilds the converter, checks the rebuilt assets, and runs the native Chrome popup tests on Linux under Xvfb.
Browser screenshots and sample Markdown are available in the `browser-evidence` workflow artifact.

### Project structure

- `manifest.json`: extension metadata and permissions.
- `popup.html` and `popup.css`: the popup interface.
- `popup.js`: conversion flow, clipboard writing, and feedback.
- `capture.js`: detached DOM capture and basic cleanup.
- `markdown-converter.js` and `converter-worker.js`: worker messaging and WASM loading.
- `internal/converter/` and `cmd/wasm/`: converter configuration and the Go-to-JavaScript bridge.
- `wasm/`: packaged converter, matching Go runtime, and generated build record.
- `scripts/` and `tests/`: rebuild tooling and verification.
- `icons/`: extension icons and their SVG source.

</details>

## Built with Firecrawl

The HTML-to-Markdown conversion comes from [Firecrawl's open-source converter](https://github.com/firecrawl/html-to-markdown), compiled to Wasm so it can run locally in Chrome.
Credit to the Firecrawl team for their work on it.

The standalone converter is MIT-licensed.
Its license, the Go runtime license, and dependency licenses are included in [`THIRD_PARTY_LICENSES/`](THIRD_PARTY_LICENSES/).
