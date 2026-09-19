<script lang="ts">
  import type { ContextAttachItemView } from "$shared/model/contextAttachModel";

  let {
    items,
    onremove,
  }: {
    items: ContextAttachItemView[];
    onremove: (id: string) => void;
  } = $props();

  const iconFor = (kind: ContextAttachItemView["kind"]): string =>
    kind === "selection" ? "code" : kind === "folder" ? "folder" : "file-code";
</script>

{#if items.length}
  <div class="context-chip-strip" role="list" aria-label="Attached context">
    {#each items as item (item.id)}
      <div class="context-chip" class:chip-selection={item.kind === "selection"} class:chip-folder={item.kind === "folder"} role="listitem" title={item.insertText}>
        {#if item.iconDataUri}
          <img class="context-chip-icon" src={item.iconDataUri} alt="" aria-hidden="true" />
        {:else}
          <span class={`codicon codicon-${iconFor(item.kind)}`} aria-hidden="true"></span>
        {/if}
        <span class="context-chip-label">{item.label}</span>
        <button type="button" class="context-chip-remove" aria-label={`Remove ${item.label}`} title="移除" onclick={() => onremove(item.id)}>
          <span class="codicon codicon-close"></span>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .context-chip-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    width: 100%;
    max-width: 100%;
  }
  .context-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: min(220px, 100%);
    min-height: 24px;
    padding: 2px 4px 2px 7px;
    border: 1px solid color-mix(in srgb, var(--frost-link) 28%, var(--frost-border-soft));
    border-radius: 8px;
    background: color-mix(in srgb, var(--frost-input-bg) 80%, var(--frost-surface));
    color: var(--frost-text);
    font-size: 11px;
  }
  .context-chip.chip-selection {
    border-color: color-mix(in srgb, var(--frost-accent) 32%, var(--frost-border-soft));
    background: color-mix(in srgb, var(--frost-accent) 10%, var(--frost-surface));
  }
  .context-chip.chip-folder {
    border-color: color-mix(in srgb, var(--frost-warning) 28%, var(--frost-border-soft));
    background: color-mix(in srgb, var(--frost-warning) 8%, var(--frost-surface));
  }
  .context-chip :global(.codicon) {
    flex: none;
    font-size: 12px;
    color: var(--frost-muted);
  }
  .context-chip-icon {
    flex: none;
    width: 14px;
    height: 14px;
    object-fit: contain;
  }
  .context-chip-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 10.5px;
  }
  .context-chip-remove {
    flex: none;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--frost-faint);
    cursor: pointer;
  }
  .context-chip-remove:hover {
    color: var(--frost-text);
    background: var(--frost-hover);
  }
</style>