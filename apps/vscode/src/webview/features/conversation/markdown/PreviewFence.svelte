<script lang="ts">
  import { postToHost } from "../../../bridge/vscodeBridge";
  import { sanitizeMermaidSvg, sanitizePreviewHtml } from "./renderMarkdown";
  import { previewView } from "./previewView";

  let {
    language,
    source,
  }: {
    language: "html" | "svg";
    source: string;
  } = $props();

  let copied = $state(false);

  const sanitized = $derived.by(() => {
    const cleaned = language === "svg" ? sanitizeMermaidSvg(source) : sanitizePreviewHtml(source);
    return cleaned && cleaned.trim().length > 0 ? cleaned : null;
  });

  function copySource(): void {
    postToHost({ type: "copyText", text: source });
    copied = true;
    window.setTimeout(() => { copied = false; }, 1200);
  }
</script>

<div class="preview-fence">
  <div class="preview-toolbar">
    <span
      class={`codicon ${language === "svg" ? "codicon-file-media" : "codicon-file-code"}`}
      aria-hidden="true"
    ></span>
    <span>{language}</span>
    <span class="preview-actions">
      <span class="preview-toggle" role="group" aria-label={`${language} view`}>
        <button
          type="button"
          class="preview-toggle-btn"
          class:active={$previewView === "preview"}
          aria-pressed={$previewView === "preview"}
          onclick={() => { previewView.set("preview"); }}
        >预览</button>
        <button
          type="button"
          class="preview-toggle-btn"
          class:active={$previewView === "source"}
          aria-pressed={$previewView === "source"}
          onclick={() => { previewView.set("source"); }}
        >源码</button>
      </span>
      <button type="button" class="preview-copy" title={`Copy ${language} source`} onclick={copySource}>
        <span class="codicon codicon-copy" aria-hidden="true"></span>
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </span>
  </div>
  {#if $previewView === "source" || !sanitized}
    {#if $previewView === "preview" && !sanitized}
      <div class="preview-status">Preview unavailable — showing source.</div>
    {/if}
    <pre class="hljs"><code>{source}</code></pre>
  {:else if language === "svg"}
    <div class="preview-host preview-host-svg">{@html sanitized}</div>
  {:else}
    <div class="preview-host preview-host-html">{@html sanitized}</div>
  {/if}
</div>

<style>
  .preview-fence {
    margin: 1.15em 0 1.3em;
    max-width: 100%;
    border: 1px solid var(--md-code-border);
    border-radius: var(--radius-sm);
    background: var(--md-code-bg);
    overflow: hidden;
  }
  .preview-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    padding: 2px 8px 2px 16px;
    border-bottom: 1px solid var(--md-code-border);
    color: var(--md-code-fg);
    font-size: 10.5px;
    font-family: var(--font-mono);
    background: color-mix(in srgb, var(--md-code-fg) 4%, transparent);
  }
  .preview-actions {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .preview-toggle {
    display: inline-flex;
    border: 1px solid var(--md-code-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .preview-toggle-btn {
    height: 22px;
    padding: 0 8px;
    border: 0;
    background: transparent;
    color: var(--md-faint);
    font-size: 10px;
    font-family: var(--font-mono);
    cursor: pointer;
  }
  .preview-toggle-btn:hover { color: var(--md-code-fg); background: var(--md-inline-code-bg); }
  .preview-toggle-btn.active {
    background: color-mix(in srgb, var(--md-link) 18%, transparent);
    color: var(--md-code-fg);
  }
  .preview-copy {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px;
    border: 1px solid var(--md-code-border);
    border-radius: 6px;
    background: transparent;
    color: var(--md-faint);
    font-size: 10px;
    font-family: var(--font-mono);
    cursor: pointer;
  }
  .preview-copy:hover { color: var(--md-code-fg); background: var(--md-inline-code-bg); }
  .preview-status { padding: 8px 16px; color: var(--md-faint); font-size: 11px; }
  .preview-host {
    padding: 12px 16px;
    max-height: 480px;
    overflow: auto;
    user-select: text;
  }
  /* An HTML preview reads as a page: neutral light canvas regardless of theme. */
  .preview-host-html {
    background: #ffffff;
    color: #1f2937;
  }
  .preview-host-svg {
    display: flex;
    justify-content: center;
    background: transparent;
  }
  .preview-host-svg :global(svg) { max-width: 100%; height: auto; }
  .preview-fence :global(pre) { margin: 0; border: 0; border-radius: 0; background: transparent; }
</style>
