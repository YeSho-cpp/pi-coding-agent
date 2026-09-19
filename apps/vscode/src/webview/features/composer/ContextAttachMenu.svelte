<script lang="ts">
  import { onMount } from "svelte";

  import { postToHost } from "../../bridge/vscodeBridge";

  let {
    sessionId,
    open = $bindable(false),
    disabled = false,
  }: {
    sessionId: string;
    open?: boolean;
    disabled?: boolean;
  } = $props();

  let root = $state<HTMLElement | null>(null);

  const items = [
    {
      id: "files",
      icon: "search",
      label: "Files and folders",
      detail: "QuickPick · 文件/文件夹 → @路径",
      run: () => postToHost({ type: "pickContext", mode: "filesAndFolders" }),
    },
  ];

  onMount(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (!open) return;
      if (root?.contains(event.target as Node)) return;
      open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  function activate(item: (typeof items)[number]): void {
    open = false;
    if (disabled) return;
    item.run();
  }
</script>

<div class="context-attach-wrap" bind:this={root}>
  <button
    class="context-attach-trigger"
    type="button"
    aria-label="Attach context"
    aria-haspopup="menu"
    aria-expanded={open}
    title="Attach context (files, selection, folder)"
    {disabled}
    onclick={() => { open = !open; }}
  >
    <span class="codicon codicon-add"></span>
  </button>
  {#if open}
    <div class="context-attach-menu" role="menu" aria-label="Attach context">
      <div class="context-attach-menu-title">Attach context</div>
      {#each items as item (item.id)}
        <button type="button" role="menuitem" class="context-attach-item" onclick={() => activate(item)}>
          <span class={`codicon codicon-${item.icon}`} aria-hidden="true"></span>
          <span class="context-attach-copy">
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </span>
        </button>
      {/each}
      <div class="context-attach-hint">Esc cancels menu · chips clear on Esc</div>
    </div>
  {/if}
</div>

<style>
  .context-attach-wrap {
    position: relative;
    flex: none;
  }
  .context-attach-trigger {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px dashed color-mix(in srgb, var(--frost-accent) 22%, var(--frost-border-soft));
    border-radius: 8px;
    background: color-mix(in srgb, var(--frost-accent) 6%, transparent);
    color: color-mix(in srgb, var(--frost-accent) 70%, var(--frost-muted));
    cursor: pointer;
  }
  .context-attach-trigger:hover:not(:disabled),
  .context-attach-trigger[aria-expanded="true"] {
    color: var(--frost-text);
    background: var(--frost-hover);
    border-color: color-mix(in srgb, var(--frost-accent) 25%, var(--frost-border));
  }
  .context-attach-trigger:disabled { opacity: 0.45; cursor: default; }
  .context-attach-menu {
    position: absolute;
    z-index: 40;
    left: 0;
    bottom: calc(100% + 6px);
    width: min(280px, calc(100vw - 24px));
    padding: 6px;
    background: var(--frost-surface-raised);
    border: 1px solid var(--frost-border);
    border-radius: 12px;
    box-shadow: var(--frost-shadow, 0 14px 40px rgba(0, 0, 0, 0.4));
  }
  .context-attach-menu-title {
    padding: 6px 8px 4px;
    color: var(--frost-faint);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .context-attach-item {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--frost-text);
    text-align: left;
    cursor: pointer;
  }
  .context-attach-item:hover { background: var(--frost-hover); }
  .context-attach-item :global(.codicon) {
    margin-top: 2px;
    color: var(--frost-muted);
  }
  .context-attach-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .context-attach-copy strong { font-size: 12px; font-weight: 560; }
  .context-attach-copy small {
    color: var(--frost-muted);
    font-size: 10px;
    line-height: 1.35;
  }
  .context-attach-hint {
    margin-top: 4px;
    padding: 6px 8px 2px;
    border-top: 1px solid var(--frost-border-soft);
    color: var(--frost-faint);
    font-size: 10px;
  }
</style>
