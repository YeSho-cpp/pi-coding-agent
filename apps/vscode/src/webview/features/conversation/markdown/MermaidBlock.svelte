<script lang="ts">
  import { postToHost } from "../../../bridge/vscodeBridge";
  import { getCachedMermaidSvg, renderMermaidSvg } from "./mermaidRenderer";

  let { source }: { source: string } = $props();

  let status = $state<"loading" | "ready" | "error">("loading");
  let svgHtml = $state("");
  let errorText = $state<string | null>(null);
  let copied = $state(false);
  let requestId = 0;

  function copySource(): void {
    postToHost({ type: "copyText", text: source });
    copied = true;
    window.setTimeout(() => { copied = false; }, 1200);
  }

  $effect(() => {
    const text = source;
    const cached = getCachedMermaidSvg(text);
    if (cached) {
      svgHtml = cached;
      status = "ready";
      errorText = null;
      return;
    }

    const id = ++requestId;
    // Do not write reactive fields that this effect reads before the async work;
    // only bump the local request token and status for UI.
    status = "loading";
    errorText = null;

    void renderMermaidSvg(text).then(
      (svg) => {
        if (id !== requestId) return;
        svgHtml = svg;
        status = "ready";
      },
      (error: unknown) => {
        if (id !== requestId) return;
        status = "error";
        errorText = error instanceof Error ? error.message : "Failed to render diagram";
        svgHtml = "";
      },
    );
  });
</script>

<div class="mermaid-block" class:mermaid-error={status === "error"} aria-busy={status === "loading"}>
  <div class="mermaid-toolbar">
    <span class="codicon codicon-type-hierarchy" aria-hidden="true"></span>
    <span>diagram</span>
    <button type="button" class="mermaid-copy" title="Copy mermaid source" onclick={copySource}>
      <span class="codicon codicon-copy" aria-hidden="true"></span>
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  </div>
  {#if status === "ready" && svgHtml}
    <div class="mermaid-host">{@html svgHtml}</div>
  {:else if status === "error"}
    <div class="mermaid-fallback">
      <div class="mermaid-status">{errorText}</div>
      <pre class="hljs"><code>{source}</code></pre>
    </div>
  {:else}
    <div class="mermaid-status">Rendering diagram…</div>
  {/if}
</div>

<style>
.mermaid-block {
  margin: .65em 0 .85em;
  max-width: 100%;
  border: 1px solid var(--frost-border-soft);
  border-radius: 7px;
  background: var(--frost-code-bg);
  overflow: hidden;
}
.mermaid-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 10px;
  border-bottom: 1px solid var(--frost-border-soft);
  color: var(--frost-muted);
  font-size: 10.5px;
  background: color-mix(in srgb, var(--frost-surface) 55%, transparent);
}
.mermaid-copy {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--frost-border-soft);
  border-radius: 6px;
  background: transparent;
  color: var(--frost-muted);
  font-size: 10px;
  cursor: pointer;
}
.mermaid-copy:hover { color: var(--frost-text); background: var(--frost-hover); }
.mermaid-host { padding: 10px 11px; min-width: min-content; overflow: auto; user-select: text; }
.mermaid-host :global(svg) { max-width: none; height: auto; }
.mermaid-status { padding: 8px 11px; color: var(--frost-muted); font-size: 11px; }
.mermaid-fallback :global(pre) { margin: 0; border: 0; border-radius: 0; background: transparent; }
</style>
