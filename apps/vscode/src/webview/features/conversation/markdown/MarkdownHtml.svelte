<script lang="ts">
  import { postToHost } from "../../../bridge/vscodeBridge";
  import { ensureKatex, isKatexReady, renderMarkdownHtml } from "./renderMarkdown";
  import { mountMarkdownImages } from "./mountMarkdownImages";

  let { content }: { content: string } = $props();

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
    return renderMarkdownHtml(content);
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
    return () => images.destroy();
  });

  function tableToMarkdown(table: Element): string {
    const rows = [...table.querySelectorAll("tr")];
    if (!rows.length) return "";
    return rows
      .map((row) =>
        [...row.querySelectorAll("th,td")]
          .map((cell) => (cell.textContent ?? "").trim().replaceAll("|", "\\|"))
          .join(" | "),
      )
      .join("\n");
  }

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
