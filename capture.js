// Chrome serializes this function into the active page, so keep it self-contained.
export function capturePage() {
  const root = document.documentElement.cloneNode(true);
  const originalImages = document.querySelectorAll("img");
  root.querySelectorAll("img").forEach((image, index) => {
    const current = originalImages[index].currentSrc;
    const lazy = image.getAttribute("data-src");
    const src = current && !current.startsWith("data:") ? current : lazy || current;
    if (src) image.setAttribute("src", src);
  });

  // Checkbox state can change without updating its HTML attribute.
  const originalCheckboxes = document.querySelectorAll('input[type="checkbox"]');
  root.querySelectorAll('input[type="checkbox"]').forEach((checkbox, index) => {
    checkbox.toggleAttribute("checked", originalCheckboxes[index].checked);
  });

  // Clean a detached copy, preserving all page text and its semantic structure.
  root.querySelectorAll("head, script, style, noscript, template").forEach(node => node.remove());
  return { html: root.outerHTML, baseURL: document.baseURI };
}
