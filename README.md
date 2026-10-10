# ClipMD

A small Chrome extension that copies the current page's HTML to your clipboard.
Open ClipMD, click **Copy HTML**, and paste wherever you need it.

![ClipMD popup showing the current page and Copy HTML button](docs/clipmd.png)

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select this `ClipMD` folder.
4. Pin ClipMD using Chrome's extensions menu.
5. Open a website, click ClipMD, then click **Copy HTML**.

No dependencies or build step are required.
After changing extension files, click **Reload** on its card in `chrome://extensions`.

## What gets copied

ClipMD copies the currently loaded page's DOM HTML as plain text, including its doctype when present.
Content added by JavaScript is included once it exists in the DOM.
It preserves the page's HTML instead of cleaning it or converting it to Markdown.
It does not inline separate iframe documents, shadow roots, or text drawn on a canvas.

ClipMD works on ordinary HTTP and HTTPS pages.
Chrome's internal pages and the Chrome Web Store cannot be captured.

## Privacy and permissions

Capture and copying happen locally.
ClipMD does not send page content to a server or store a copy of it.

| Permission | Purpose |
| --- | --- |
| `activeTab` | Access the current page after you open ClipMD. |
| `scripting` | Read the page's current HTML. |
| `clipboardWrite` | Copy the HTML to your clipboard. |

## Project structure

- `manifest.json`: extension metadata and permissions.
- `popup.html` and `popup.css`: the popup interface.
- `popup.js`: page capture, clipboard writing, and feedback.
- `icons/`: extension icons and their SVG source.
