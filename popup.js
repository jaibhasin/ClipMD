const copyButton = document.getElementById("copy-button");
const buttonLabel = document.getElementById("button-label");
const copyIcon = document.getElementById("copy-icon");
const successIcon = document.getElementById("success-icon");
const spinner = document.getElementById("spinner");
const status = document.getElementById("status");
const statusTitle = document.getElementById("status-title");
const statusDetail = document.getElementById("status-detail");
let activeTab;

function showStatus(state, title, detail) {
  status.dataset.state = state;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function isSupportedPage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const page = new URL(url);
  return page.hostname !== "chromewebstore.google.com" &&
    !(page.hostname === "chrome.google.com" && page.pathname.startsWith("/webstore"));
}

function formatSize(html) {
  const bytes = new Blob([html]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function initialize() {
  try {
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) throw new Error("No active tab");

    const pageTitle = document.getElementById("page-title");
    const pageDomain = document.getElementById("page-domain");
    pageTitle.textContent = activeTab.title || "Untitled page";
    pageTitle.title = pageTitle.textContent;
    const supported = isSupportedPage(activeTab.url);
    pageDomain.textContent = supported ? new URL(activeTab.url).hostname : "Chrome-protected page";
    pageDomain.title = pageDomain.textContent;

    if (!supported) {
      buttonLabel.textContent = "Unavailable here";
      showStatus("error", "Chrome protects this page.", "Open a regular website to copy its HTML.");
      return;
    }

    copyButton.disabled = false;
  } catch {
    document.getElementById("page-title").textContent = "Page unavailable";
    document.getElementById("page-domain").textContent = "Open ClipMD on a website";
    buttonLabel.textContent = "Unavailable here";
    showStatus("error", "Couldn't find the current page.", "Close this popup and open ClipMD again.");
  }
}

copyButton.addEventListener("click", async () => {
  if (!activeTab || copyButton.disabled) return;
  copyButton.disabled = true;
  copyButton.setAttribute("aria-busy", "true");
  copyButton.dataset.state = "copying";
  buttonLabel.textContent = "Copying…";
  copyIcon.hidden = true;
  successIcon.hidden = true;
  spinner.hidden = false;
  showStatus("copying", "Copying your page…", "Keep this popup open for a moment.");

  try {
    const [capture] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => {
        const doctype = document.doctype
          ? `${new XMLSerializer().serializeToString(document.doctype)}\n`
          : "";
        return doctype + document.documentElement.outerHTML;
      },
    });
    const html = capture?.result;
    if (typeof html !== "string" || !html) throw new Error("Empty capture");
    await navigator.clipboard.writeText(html);
    copyButton.dataset.state = "copied";
    buttonLabel.textContent = "Copy again";
    successIcon.hidden = false;
    showStatus("copied", "Copied to clipboard", `${formatSize(html)} of HTML · Ready to paste.`);
  } catch (error) {
    copyButton.dataset.state = "error";
    buttonLabel.textContent = "Try again";
    copyIcon.hidden = false;

    if (error.name === "NotAllowedError") {
      showStatus("error", "Clipboard access was blocked.", "Keep this popup open and try again.");
    } else if (/cannot access|cannot be scripted|missing host permission/i.test(error.message)) {
      showStatus("error", "Chrome won't let us read this page.", "Try ClipMD on a regular website.");
    } else {
      showStatus("error", "Couldn't copy this page.", "Let the page finish loading, then try again.");
    }
  } finally {
    copyButton.disabled = false;
    copyButton.removeAttribute("aria-busy");
    spinner.hidden = true;
  }
});

initialize();
