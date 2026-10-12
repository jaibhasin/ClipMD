// Chrome serializes this function into the active page, so keep it self-contained.
export function capturePage() {
  // WindowProxy exposes frame indices across origins without exposing content.
  const indices = [];
  for (let frame = window; frame !== frame.top; frame = frame.parent) {
    const parent = frame.parent;
    for (let index = 0; index < parent.length; index++) {
      if (parent[index] === frame) {
        indices.unshift(index);
        break;
      }
    }
  }
  const sourcePath = indices.join(".");

  function visible(element) {
    for (let node = element; node; node = node.parentElement) {
      const style = node.ownerDocument.defaultView.getComputedStyle(node);
      if (node.hidden || style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  }

  function snapshot(doc, path, depth = 0) {
    const view = doc.defaultView;
    // A course shell has little prose of its own and a large embedded lesson.
    // Keep ordinary articles intact even when they contain a large video player.
    const prose = [...doc.querySelectorAll("p, pre, table, blockquote")]
      .filter(node => !node.closest("nav, aside, header, footer") && visible(node))
      .reduce((length, node) => length + node.textContent.trim().length, 0);
    const frames = [...doc.querySelectorAll("iframe, frame")];
    const candidates = frames.map(frame => {
      const rect = frame.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, view.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, view.innerHeight) - Math.max(rect.top, 0));
      return { frame, area: visible(frame) && rect.width >= 300 && rect.height >= 200 ? width * height : 0 };
    }).sort((a, b) => b.area - a.area);
    const primary = candidates[0];
    let embedded;
    if (depth < 8 && prose < 300 && primary?.area >= view.innerWidth * view.innerHeight * 0.4) {
      const frame = primary.frame;
      let index = 0;
      while (index < view.length && view[index] !== frame.contentWindow) index++;
      const childPath = path ? `${path}.${index}` : String(index);
      let child;
      try { child = frame.contentDocument; } catch { /* Cross-origin document. */ }
      if (child?.documentElement && child.readyState === "complete") return snapshot(child, childPath, depth + 1);
      const url = new URL(frame.src || doc.baseURI, doc.baseURI);
      embedded = { path: childPath, url: url.href };
    }

    const root = doc.documentElement.cloneNode(true);
    const originalImages = doc.querySelectorAll("img");
    root.querySelectorAll("img").forEach((image, index) => {
      const current = originalImages[index].currentSrc;
      const lazy = image.getAttribute("data-src");
      const src = current && !current.startsWith("data:") ? current : lazy || current;
      if (src) image.setAttribute("src", src);
    });

    // Checkbox state can change without updating its HTML attribute.
    const originalCheckboxes = doc.querySelectorAll('input[type="checkbox"]');
    root.querySelectorAll('input[type="checkbox"]').forEach((checkbox, index) => {
      checkbox.toggleAttribute("checked", originalCheckboxes[index].checked);
    });

    // Remove inactive tabs and hidden tracking pixels from the detached copy.
    const originals = doc.documentElement.querySelectorAll("*");
    root.querySelectorAll("*").forEach((node, index) => {
      const style = view.getComputedStyle(originals[index]);
      if (originals[index].hidden || style.display === "none" || style.visibility === "hidden") node.remove();
      if (node.tagName === "IMG" && originals[index].naturalWidth === 1 && originals[index].naturalHeight === 1) node.remove();
    });
    root.querySelectorAll("head, script, style, noscript, template").forEach(node => node.remove());
    return { html: root.outerHTML, baseURL: doc.baseURI, sourcePath, embedded };
  }

  return snapshot(document, sourcePath);
}

export class CaptureError extends Error {}

export class EmbeddedAccessError extends CaptureError {
  constructor(url) {
    const site = new URL(url);
    super(`Allow access to ${site.hostname} to copy the embedded lesson.`);
    this.origins = [`${site.protocol}//${site.hostname}/*`];
  }
}

export async function captureTab(tabId) {
  const [main] = await chrome.scripting.executeScript({ target: { tabId }, func: capturePage });
  let captured = main?.result;
  const visited = new Set();
  while (captured?.embedded) {
    const { path, url } = captured.embedded;
    if (visited.has(path) || visited.size >= 8) throw new CaptureError("The embedded lesson could not be read. Open it in its own tab and try again.");
    visited.add(path);
    if (!/^https?:\/\//i.test(url)) throw new CaptureError("Open the embedded lesson in its own tab, then try ClipMD again.");
    const access = new EmbeddedAccessError(url);
    if (!await chrome.permissions.contains({ origins: access.origins })) throw access;
    const frames = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: capturePage });
    captured = frames.find(frame => frame.result?.sourcePath === path)?.result;
    if (!captured) throw new CaptureError("The embedded lesson is unavailable. Let it finish loading or open it in its own tab.");
  }
  if (typeof captured?.html !== "string" || !captured.html) throw new CaptureError("This page has no content to copy.");
  return captured;
}
