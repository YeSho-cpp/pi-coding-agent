<script lang="ts">
  import { postToHost } from "../../bridge/vscodeBridge";
  import {
    activateEditorChip,
    deactivateEditorChip,
    editorChipAttached,
    editorChipDismissed,
    editorChipDisplayLabel,
    editorContextHint,
  } from "./editorContextHintStore.svelte";

  const hint = $derived($editorContextHint);
  const attached = $derived($editorChipAttached);
  const dismissed = $derived($editorChipDismissed);
  const visible = $derived(Boolean(hint.available && hint.path) && !dismissed);
  const label = $derived(editorChipDisplayLabel(hint, attached));
  const isSelection = $derived(attached && hint.hasSelection);
  const icon = $derived(isSelection ? "code" : "file-code");

  function syncHost(next: boolean): void {
    postToHost({ type: "setEditorChipAttached", attached: next });
  }

  function onChipClick(): void {
    if (!visible) return;
    if (!attached) {
      activateEditorChip();
      syncHost(true);
    }
  }

  function onRemove(event: MouseEvent): void {
    event.stopPropagation();
    deactivateEditorChip();
    syncHost(false);
  }
</script>

{#if visible}
  <div
    class="editor-context-chip"
    class:attached
    class:inactive={!attached}
    class:selection={isSelection}
    role="status"
    aria-label={attached ? `Attached ${label}` : `Inactive ${label}`}
  >
    {#if hint.iconDataUri}
      <img class="ecc-icon-img" src={hint.iconDataUri} alt="" aria-hidden="true" />
    {:else}
      <span class={`ecc-icon codicon codicon-${icon}`} aria-hidden="true"></span>
    {/if}
    <button
      type="button"
      class="ecc-label"
      class:is-inactive={!attached}
      style={!attached ? "font-style:italic;font-synthesis:style" : undefined}
      title={attached ? "已生效 · 发送时会带上 · Esc/× 取消" : "未生效 · 点击重新附加"}
      onclick={onChipClick}
    >
      {label}
    </button>
    {#if attached}
      <button type="button" class="ecc-remove" aria-label="Deactivate context chip" title="取消生效 (Esc)" onclick={onRemove}>
        <span class="codicon codicon-close"></span>
      </button>
    {/if}
  </div>
{/if}

<style>
  .editor-context-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    min-height: 28px;
    margin: 0;
    padding: 2px 4px 2px 10px;
    border: 1px solid var(--frost-border-soft);
    border-radius: 999px;
    background: color-mix(in srgb, var(--frost-input-bg) 72%, transparent);
    vertical-align: middle;
  }
  .editor-context-chip.attached {
    border-color: color-mix(in srgb, var(--frost-focus) 36%, var(--frost-border));
    background: color-mix(in srgb, var(--frost-input-bg) 88%, var(--frost-focus) 4%);
  }
  .editor-context-chip.inactive {
    border-color: transparent;
    background: transparent;
    opacity: 1;
    font-style: italic;
  }
  .editor-context-chip.inactive .ecc-icon {
    opacity: 0.72;
    filter: grayscale(0.1);
  }
  .ecc-icon {
    flex: none;
    font-size: 13px;
    color: var(--frost-muted);
  }
  .ecc-icon-img {
    flex: none;
    width: 14px;
    height: 14px;
    object-fit: contain;
  }
  .inactive .ecc-icon-img {
    opacity: 0.72;
    filter: grayscale(0.1);
  }
  .attached .ecc-icon {
    color: color-mix(in srgb, var(--frost-success) 55%, var(--frost-muted));
  }
  .ecc-label {
    min-width: 0;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 2px 2px;
    border: 0;
    background: transparent;
    color: var(--frost-text);
    font-family: var(--font-mono);
    font-size: 11.5px;
    cursor: pointer;
  }
  /* Inactive label: italic + light skew when mono face has no italic cut */
  .editor-context-chip.inactive .ecc-label.is-inactive,
  .editor-context-chip.inactive button.ecc-label {
    color: var(--frost-muted);
    font-style: italic !important;
    font-synthesis: style weight;
    cursor: pointer;
    transform: skewX(-6deg);
    transform-origin: left center;
  }
  .ecc-remove {
    flex: none;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--frost-muted);
    cursor: pointer;
  }
  .ecc-remove:hover {
    color: var(--frost-text);
    background: var(--frost-hover);
  }
</style>
