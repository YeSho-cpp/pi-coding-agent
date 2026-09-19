<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";

  import { postToHost } from "../../bridge/vscodeBridge";
  import { insertDraftText } from "../composer/composerDraftSync";
  import { addContextChips } from "../composer/contextAttachStore.svelte";
  import { presentationStore } from "../../state/sessionViewStore.svelte";

  let visible = $state(false);
  let x = $state(0);
  let y = $state(0);
  let selectedText = $state("");
  let copied = $state(false);
  let queued = $state(false);

  function readSelection(): void {
    const sel = window.getSelection();
    const text = sel?.toString() ?? "";
    const trimmed = text.trim();
    if (!sel || sel.isCollapsed || trimmed.length < 2) {
      visible = false;
      selectedText = "";
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      visible = false;
      return;
    }
    selectedText = trimmed;
    x = Math.min(window.innerWidth - 170, Math.max(90, rect.left + rect.width / 2));
    y = Math.max(8, rect.top - 40);
    visible = true;
  }

  function copySelection(): void {
    if (!selectedText) return;
    postToHost({ type: "copyText", text: selectedText });
    copied = true;
    window.setTimeout(() => { copied = false; }, 1200);
  }

  /** OpenChamber-style: push selected transcript text into the composer as context. */
  function addToPrompt(): void {
    if (!selectedText) return;
    const state = get(presentationStore);
    const sessionId = state.displayedSession?.id || state.activeSessionId;
    const body = selectedText.length > 4000 ? `${selectedText.slice(0, 4000)}\n…` : selectedText;
    const block = `\`\`\`\n${body}\n\`\`\``;
    if (sessionId) {
      insertDraftText(sessionId, "webview", block);
      // Also surface as a chip-like note via context only when path-like; otherwise draft is enough.
      const pathLike = /^[^\s]+\.[A-Za-z0-9]+(?::\d+)?(?:-\d+)?$/.test(body.split(/\s+/)[0] ?? "");
      if (pathLike) {
        const path = (body.split(/\s+/)[0] ?? "").split(":")[0] ?? body;
        addContextChips(sessionId, [{
          id: `sel-${Date.now()}`,
          kind: "selection",
          path,
          label: body.split(/\s+/)[0] ?? "selection",
          insertText: `\`${body.split(/\s+/)[0]}\``,
        }]);
      }
    }
    queued = true;
    window.setTimeout(() => { queued = false; }, 1200);
  }

  onMount(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") visible = false;
    };
    document.addEventListener("mouseup", readSelection);
    document.addEventListener("keyup", readSelection);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mouseup", readSelection);
      document.removeEventListener("keyup", readSelection);
      document.removeEventListener("keydown", onKey);
    };
  });
</script>

{#if visible && selectedText}
  <div class="text-selection-menu" style={`left:${x}px;top:${y}px`} role="toolbar" aria-label="Selection actions">
    <button type="button" class="text-selection-btn" title="Copy selection" onclick={copySelection}>
      <span class="codicon codicon-copy" aria-hidden="true"></span>
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
    <button type="button" class="text-selection-btn primary" title="Add selected text to composer" onclick={addToPrompt}>
      <span class="codicon codicon-insert" aria-hidden="true"></span>
      <span>{queued ? "Added" : "Add to prompt"}</span>
    </button>
  </div>
{/if}

<style>
  .text-selection-menu {
    position: fixed;
    z-index: 80;
    transform: translate(-50%, 0);
    display: flex;
    gap: 4px;
    pointer-events: auto;
  }
  .text-selection-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 9px;
    border: 1px solid color-mix(in srgb, var(--frost-border) 70%, var(--frost-border-soft));
    border-radius: 8px;
    background: var(--frost-surface-raised);
    color: var(--frost-text);
    font-size: 11px;
    box-shadow: var(--frost-shadow, 0 8px 24px rgba(0,0,0,.35));
    cursor: pointer;
  }
  .text-selection-btn:hover { background: var(--frost-hover); }
  .text-selection-btn.primary {
    border-color: color-mix(in srgb, var(--frost-accent) 40%, var(--frost-border));
    background: color-mix(in srgb, var(--frost-accent) 16%, var(--frost-surface-raised));
    color: var(--frost-accent);
  }
</style>
