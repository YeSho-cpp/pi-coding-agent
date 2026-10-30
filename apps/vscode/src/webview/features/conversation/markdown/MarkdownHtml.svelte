<script lang="ts">
  import { untrack } from "svelte";

  import { postToHost } from "../../../bridge/vscodeBridge";
  import { ensureKatex, isKatexReady, renderMarkdownHtml } from "./renderMarkdown";
  import { mountMarkdownImages } from "./mountMarkdownImages";
  import { cachedHighlight, requestHighlightedCode } from "./highlightClient";
  import { requestFileIcon } from "./fileIconClient";
  import { tableToMarkdown } from "./tableMarkdown";

  /** Streaming text repaints at most this often; the final text always lands. */
  const STREAM_RENDER_INTERVAL_MS = 100;
  /** A fence must sit unchanged this long before the host is asked to tokenize it. */
  const HIGHLIGHT_DELAY_MS = 150;

  let { content, streaming = false }: { content: string; streaming?: boolean } = $props();

  let held = $state<string | null>(null);
  let lastRenderAt = Number.NEGATIVE_INFINITY;
  const shown = $derived(streaming && held !== null ? held : content);

  $effect(() => {
    if (!streaming) {
      held = null;
      return;
    }
    const latest = content;
    if (untrack(() => held) === latest) return;
    const commit = (): void => {
      lastRenderAt = performance.now();
      held = latest;
    };
    const wait = lastRenderAt + STREAM_RENDER_INTERVAL_MS - performance.now();
    if (wait <= 0) {
      commit();
      return;
    }
    const timer = setTimeout(commit, wait);
    return () => clearTimeout(timer);
  });

  let container: HTMLDivElement | undefined = $state();

  // Bumps after KaTeX chunk loads so math placeholders re-render.
  let katexGeneration = $state(isKatexReady() ? 1 : 0);

  $effect(() => {
    if (isKatexReady()) return;
    let cancelled = false;
    void ensureKatex().then(() => {
      if (!cancelled) katexGeneration += 1;
    });
    return () => {
      cancelled = true;
    };
  });

  const html = $derived.by(() => {
    void katexGeneration;
    return renderMarkdownHtml(shown);
  });

  // ---- Code-block actions ----

  // Re-run after every render: `{@html}` replacement drops enhancements.
  $effect(() => {
    const root = container;
    if (!root) return;
    void html; // dependency on the rendered markup
    const images = mountMarkdownImages(root);
    for (const pre of root.querySelectorAll("pre.hljs")) {
      // Every markdown fence carries a .code-head, so the actions live there and never sit
      // on top of the first line of code. Mermaid's error fallback has no head and keeps
      // its own toolbar Copy button, so it is skipped here.
      const head = pre.querySelector(":scope > .code-head");
      if (!head) continue;
      for (const stale of pre.querySelectorAll(".code-actions")) stale.remove();
      head.append(createCodeBlockActions());
    }

    // Upgrade each fence from the instant highlight.js paint to the host's TextMate pass, which
    // tokens like identifiers the way the editor does. Diff fences keep their dedicated renderer.
    // A fence the host already answered repaints from the cache; the rest are asked for once they
    // stop changing, so a streaming answer does not send every intermediate state to the host.
    const upgrades: ReturnType<typeof setTimeout>[] = [];
    const waiting: HTMLElement[] = [];
    for (const pre of root.querySelectorAll("pre.hljs:not([data-tm])")) {
      const element = pre as HTMLElement;
      if (element.classList.contains("language-diff")) continue;
      const lang = element.querySelector(":scope > .code-head > .code-lang")?.textContent?.trim().toLowerCase();
      if (!lang || lang === "txt" || lang === "text") continue;
      const codeEl = element.querySelector(":scope > .code-scroll > code");
      if (!codeEl) continue;
      const text = codeEl.textContent ?? "";
      if (!text) continue;
      const cached = cachedHighlight(lang, text);
      if (cached) {
        codeEl.innerHTML = cached;
        element.dataset.tm = "done";
        continue;
      }
      element.dataset.tm = "pending";
      waiting.push(element);
      upgrades.push(setTimeout(() => {
        void requestHighlightedCode(lang, text).then((html) => {
          if (!html || !element.isConnected || element.dataset.tm !== "pending") return;
          codeEl.innerHTML = html;
          element.dataset.tm = "done";
        });
      }, HIGHLIGHT_DELAY_MS));
    }
    // File chips get the active icon-theme artwork in front of the label — the same
    // lookup the composer chips use — resolved lazily through the host.
    for (const anchor of root.querySelectorAll<HTMLElement>("a.file-link")) {
      if (anchor.dataset.iconReady) continue;
      const path = anchor.getAttribute("data-file-path");
      const code = anchor.querySelector(":scope > code");
      if (!path || !code) continue;
      anchor.dataset.iconReady = "pending";
      void requestFileIcon(path).then((dataUri) => {
        if (!anchor.isConnected) return;
        anchor.dataset.iconReady = "1";
        if (!dataUri || code.querySelector(".file-chip-icon")) return;
        const icon = document.createElement("img");
        icon.className = "file-chip-icon";
        icon.src = dataUri;
        icon.alt = "";
        icon.setAttribute("aria-hidden", "true");
        code.insertBefore(icon, code.firstChild);
      });
    }
    // OpenChamber-style: every markdown table gets a wrap + copy (TSV/Markdown) affordance.
    for (const table of [...root.querySelectorAll("table")]) {
      if (table.closest(".frost-table-wrap")) continue;
      const wrap = document.createElement("div");
      wrap.className = "frost-table-wrap";
      table.parentNode?.insertBefore(wrap, table);
      wrap.appendChild(table);
      const bar = document.createElement("div");
      bar.className = "frost-table-bar";
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-btn frost-table-copy";
      copyBtn.title = "Copy table";
      copyBtn.innerHTML = '<span class="codicon codicon-copy" aria-hidden="true"></span><span class="copy-btn-label">Copy table</span>';
      copyBtn.addEventListener("click", () => {
        const text = tableToMarkdown(table);
        if (!text) return;
        postToHost({ type: "copyText", text });
        const label = copyBtn.querySelector(".copy-btn-label");
        if (label) label.textContent = "Copied";
        window.setTimeout(() => {
          const l = copyBtn.querySelector(".copy-btn-label");
          if (l) l.textContent = "Copy table";
        }, 1200);
      });
      bar.append(copyBtn);
      wrap.insertBefore(bar, table);
    }
    return () => {
      images.destroy();
      for (const timer of upgrades) clearTimeout(timer);
      for (const element of waiting) if (element.dataset.tm === "pending") delete element.dataset.tm;
    };
  });

  function createCodeBlockActions(): HTMLDivElement {
    const actions = document.createElement("div");
    actions.className = "code-actions";
    actions.append(createCopyButton());
    return actions;
  }

  function createCopyButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-btn";
    button.title = "Copy code";
    button.innerHTML = '<span class="codicon codicon-copy" aria-hidden="true"></span><span class="copy-btn-label">Copy</span>';
    return button;
  }

  // One pending revert timer per button; WeakMap so buttons dropped by a
  // re-render never accumulate entries.
  const COPIED_FEEDBACK_MS = 1_200;
  const copiedTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

  function copyCodeBlock(button: Element): void {
    const code = button.closest("pre")?.querySelector("code")?.textContent;
    if (!code) return;
    postToHost({ type: "copyText", text: code });
    const label = button.querySelector(".copy-btn-label");
    button.classList.add("copied");
    if (label) label.textContent = "Copied";
    const existing = copiedTimers.get(button);
    if (existing) clearTimeout(existing);
    copiedTimers.set(button, setTimeout(() => {
      button.classList.remove("copied");
      if (label) label.textContent = "Copy";
    }, COPIED_FEEDBACK_MS));
  }

  // ---- Click routing: code actions, file links, external links ----

  function handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;

    const tableCopy = target?.closest("button.frost-table-copy");
    if (tableCopy) {
      event.preventDefault();
      return; // handled by inline listener on the button
    }

    const copyButton = target?.closest("button.copy-btn");
    if (copyButton) {
      copyCodeBlock(copyButton);
      return;
    }

    const anchor = target?.closest("a");
    const path = anchor?.getAttribute("data-file-path");
    if (path) {
      event.preventDefault();
      const line = positiveInteger(anchor?.getAttribute("data-file-line"));
      const column = positiveInteger(anchor?.getAttribute("data-file-column"));
      const endLine = positiveInteger(anchor?.getAttribute("data-file-end-line"));
      postToHost({
        type: "openFile",
        path,
        ...(line === undefined ? {} : { line }),
        ...(column === undefined ? {} : { column }),
        ...(endLine === undefined ? {} : { endLine }),
      });
      return;
    }

    const href = anchor?.getAttribute("href");
    if (!href || !/^https?:\/\//i.test(href)) return;
    event.preventDefault();
    postToHost({ type: "openExternal", url: href });
  }

  function positiveInteger(value: string | null | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  function linkActions(node: HTMLElement): { destroy(): void } {
    node.addEventListener("click", handleClick);
    return { destroy: () => node.removeEventListener("click", handleClick) };
  }
</script>

<div class="markdown-body" use:linkActions bind:this={container}>{@html html}</div>
