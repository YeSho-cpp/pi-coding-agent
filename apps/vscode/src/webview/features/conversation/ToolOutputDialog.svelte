<script lang="ts">
  import { postToHost } from "../../bridge/vscodeBridge";

  let {
    open = $bindable(false),
    title = "Tool output",
    command = "",
    inputText = "",
    outputText = "",
    isError = false,
  }: {
    open?: boolean;
    title?: string;
    command?: string;
    inputText?: string;
    outputText?: string;
    isError?: boolean;
  } = $props();

  let copied = $state(false);

  function copyAll(): void {
    const parts = [command ? `$ ${command}` : "", inputText, outputText].filter(Boolean);
    postToHost({ type: "copyText", text: parts.join("\n\n") });
    copied = true;
    window.setTimeout(() => { copied = false; }, 1200);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      open = false;
    }
  }
</script>

{#if open}
  <div class="tool-dialog-backdrop" role="presentation" onclick={() => { open = false; }} onkeydown={onKeydown}>
    <div
      class="tool-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      class:is-error={isError}
      onclick={(e) => e.stopPropagation()}
      onkeydown={onKeydown}
    >
      <header class="tool-dialog-header">
        <span class="codicon codicon-output" aria-hidden="true"></span>
        <span class="tool-dialog-title">{title}</span>
        <button type="button" class="tool-dialog-action" title="Copy all" onclick={copyAll}>
          <span class="codicon codicon-copy" aria-hidden="true"></span>
          <span>{copied ? "Copied" : "Copy all"}</span>
        </button>
        <button type="button" class="tool-dialog-action" aria-label="Close" onclick={() => { open = false; }}>
          <span class="codicon codicon-close"></span>
        </button>
      </header>
      {#if command}
        <div class="tool-dialog-command" title={command}>{command}</div>
      {/if}
      <div class="tool-dialog-body">
        {#if inputText}
          <div class="tool-dialog-section">
            <div class="tool-dialog-label">Input</div>
            <pre class="tool-dialog-pre"><code>{inputText}</code></pre>
          </div>
        {/if}
        <div class="tool-dialog-section">
          <div class="tool-dialog-label">Output</div>
          <pre class="tool-dialog-pre" class:error={isError}><code>{outputText || "(empty)"}</code></pre>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .tool-dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.45);
  }
  .tool-dialog {
    width: min(860px, 100%);
    max-height: min(80vh, 720px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--frost-border);
    border-radius: 12px;
    background: var(--frost-surface-raised);
    box-shadow: var(--frost-shadow, 0 16px 48px rgba(0,0,0,.45));
    overflow: hidden;
  }
  .tool-dialog.is-error { border-color: color-mix(in srgb, var(--frost-error) 40%, var(--frost-border)); }
  .tool-dialog-header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--frost-border-soft);
  }
  .tool-dialog-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 12px;
  }
  .tool-dialog-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--frost-border-soft);
    border-radius: 7px;
    background: transparent;
    color: var(--frost-muted);
    font-size: 10.5px;
    cursor: pointer;
  }
  .tool-dialog-action:hover { color: var(--frost-text); background: var(--frost-hover); }
  .tool-dialog-command {
    padding: 6px 12px;
    border-bottom: 1px solid var(--frost-border-soft);
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--frost-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: text;
  }
  .tool-dialog-body {
    min-height: 0;
    overflow: auto;
    padding: 10px 12px 14px;
  }
  .tool-dialog-section + .tool-dialog-section { margin-top: 12px; }
  .tool-dialog-label {
    margin-bottom: 4px;
    color: var(--frost-faint);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .tool-dialog-pre {
    margin: 0;
    max-height: 48vh;
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--frost-border-soft);
    border-radius: 8px;
    background: var(--frost-code-bg);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.45;
    color: var(--frost-text);
    white-space: pre-wrap;
    user-select: text;
  }
  .tool-dialog-pre.error { color: var(--frost-error); }
  .tool-dialog-pre :global(code) { font-family: inherit; }
</style>
