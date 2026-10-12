export class ConversionError extends Error {}

// Own one worker per popup. A failed or timed-out worker is replaced on retry.
export class MarkdownConverter {
  #worker;
  #ready = false;
  #pending = new Map();
  #nextId = 0;
  #timeout;

  constructor({ timeout = 30_000 } = {}) {
    this.#timeout = timeout;
  }

  convert(html, baseURL) {
    return new Promise((resolve, reject) => {
      const id = ++this.#nextId;
      const timer = setTimeout(() => {
        this.#fail("Conversion took too long. Try again.");
      }, this.#timeout);
      this.#pending.set(id, { resolve, reject, timer, html, baseURL });
      try {
        this.#start();
        if (this.#ready) this.#send(id);
      } catch {
        this.#fail("The Markdown converter could not start. Reload the extension and try again.");
      }
    });
  }

  #start() {
    if (this.#worker) return;
    this.#worker = new Worker(new URL("converter-worker.js", import.meta.url));
    this.#worker.onerror = event => {
      event.preventDefault();
      this.#fail("The Markdown converter stopped. Try again.");
    };
    this.#worker.onmessageerror = () => this.#fail("The converter response could not be read. Try again.");
    this.#worker.onmessage = ({ data }) => {
      if (data.type === "error") {
        this.#fail(data.error);
      } else if (data.type === "ready") {
        this.#ready = true;
        for (const id of this.#pending.keys()) this.#send(id);
      } else if (data.type === "result") {
        const request = this.#pending.get(data.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.#pending.delete(data.id);
        if (data.error || typeof data.markdown !== "string" || !data.markdown.trim()) {
          request.reject(new ConversionError(data.error || "This page has no text to convert."));
        } else {
          request.resolve(data.markdown);
        }
      }
    };
  }

  #send(id) {
    const request = this.#pending.get(id);
    this.#worker.postMessage({ type: "convert", id, html: request.html, baseURL: request.baseURL });
    // Release captured content while conversion runs in the worker.
    delete request.html;
    delete request.baseURL;
  }

  #fail(message) {
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#ready = false;
    for (const request of this.#pending.values()) {
      clearTimeout(request.timer);
      request.reject(new ConversionError(message));
    }
    this.#pending.clear();
  }

  dispose() {
    this.#fail("Conversion was cancelled.");
  }
}
