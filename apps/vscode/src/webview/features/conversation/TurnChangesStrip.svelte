<script lang="ts">
  import { slide } from "svelte/transition";

  import { postToHost } from "../../bridge/vscodeBridge";
  import { requestFileIcon } from "./markdown/fileIconClient";
  import type { TurnChangeFile } from "./turnChanges";

  const COLLAPSED_ROWS = 5;
  const SLIDE_MS = 170;

  let { files, cwd }: { files: TurnChangeFile[]; cwd: string } = $props();
  /** The whole card folds to its header line; `expanded` only reaches the rows past `COLLAPSED_ROWS`. */
  let open = $state(false);
  let expanded = $state(false);
  const reduceMotion = typeof window !== "undefined"
    && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  const totalAdded = $derived(files.reduce((sum, file) => sum + file.added, 0));
  const totalRemoved = $derived(files.reduce((sum, file) => sum + file.removed, 0));
  const foldable = $derived(files.length > COLLAPSED_ROWS);
  const rows = $derived(foldable && !expanded ? files.slice(0, COLLAPSED_ROWS) : files);
  const icons = $state<Record<string, string | null>>({});

  $effect(() => {
    for (const file of files) {
      if (file.path in icons) continue;
      icons[file.path] = null;
      void requestFileIcon(file.path).then((dataUri) => {
        icons[file.path] = dataUri ?? null;
      });
    }
  });

  function displayName(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts.at(-1) || path;
  }

  function isAbsolutePath(path: string): boolean {
    return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
  }

  function openDiff(file: TurnChangeFile): void {
    const absolute = isAbsolutePath(file.path) ? file.path : `${cwd.replace(/[\\/]+$/, "")}/${file.path}`;
    postToHost({ type: "openDiff", path: absolute, baseToolCallId: file.firstToolCallId });
  }
</script>

<div class="turn-changes" role="group" aria-label="Changed files">
  <button
    type="button"
    class="turn-changes-head"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="turn-changes-tile" aria-hidden="true">
      <span class="codicon codicon-diff-multiple"></span>
    </span>
    <span class="turn-changes-titles">
      <span class="turn-changes-title">已更改 {files.length} 个文件</span>
      <span class="turn-changes-total">
        <span class="stat-add">+{totalAdded}</span>
        <span class="stat-del">-{totalRemoved}</span>
      </span>
    </span>
    <span class={`codicon codicon-chevron-${open ? "down" : "right"} turn-changes-chevron`} aria-hidden="true"></span>
  </button>
  {#if open}
    <div class="turn-changes-body" transition:slide={{ duration: reduceMotion ? 0 : SLIDE_MS }}>
      <div class="turn-changes-list">
        {#each rows as file (file.path)}
          <button type="button" class="turn-change-row" title={file.path} onclick={() => openDiff(file)}>
            {#if icons[file.path]}
              <img class="turn-change-icon" src={icons[file.path] ?? ""} alt="" aria-hidden="true" />
            {:else}
              <span class="codicon codicon-file turn-change-icon-fallback" aria-hidden="true"></span>
            {/if}
            <span class="turn-change-name">{displayName(file.path)}</span>
            <span class="turn-change-stat">
              <span class="stat-add">+{file.added}</span>
              <span class="stat-del">-{file.removed}</span>
            </span>
          </button>
        {/each}
      </div>
      {#if foldable}
        <button
          type="button"
          class="turn-changes-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? "Show fewer changed files" : `Show all ${files.length} changed files`}
          onclick={() => (expanded = !expanded)}
        >
          <span>{expanded ? "收起" : `全部 ${files.length} 个文件`}</span>
          <span class={`codicon codicon-chevron-${expanded ? "up" : "down"}`} aria-hidden="true"></span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .turn-changes {
    min-width: 0;
    margin-top: 8px;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--frost-surface) 72%, transparent);
    box-shadow: var(--frost-hairline-soft);
  }

  .turn-changes-head {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 8px 12px;
    border: 0;
    background: color-mix(in srgb, var(--frost-text) 4%, transparent);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast) ease;
  }

  .turn-changes-head:hover {
    background: color-mix(in srgb, var(--frost-text) 7%, transparent);
  }

  .turn-changes-head:focus-visible {
    outline: 1px solid var(--frost-focus);
    outline-offset: -1px;
  }

  .turn-changes-chevron {
    flex: none;
    margin-left: 2px;
    color: var(--frost-faint);
    font-size: 12px;
    transition: color var(--motion-fast) ease;
  }

  .turn-changes-head:hover .turn-changes-chevron {
    color: var(--frost-text);
  }

  .turn-changes-tile {
    display: grid;
    flex: none;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--frost-text) 6%, transparent);
    box-shadow: var(--frost-hairline-soft);
    color: var(--frost-muted);
    font-size: 16px;
  }

  .turn-changes-titles {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .turn-changes-title {
    overflow: hidden;
    color: var(--frost-text);
    font-size: 12.5px;
    font-weight: 500;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .turn-changes-total {
    display: inline-flex;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    line-height: 16px;
  }

  .turn-changes-body {
    min-width: 0;
    overflow: hidden;
    border-top: 0.5px solid var(--frost-stroke-soft);
  }

  .turn-changes-list {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .turn-change-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    width: 100%;
    min-height: 28px;
    padding: 5px 12px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--frost-text);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast) ease;
  }

  .turn-change-row:hover {
    background: var(--frost-hover);
  }

  .turn-change-icon,
  .turn-change-icon-fallback {
    flex: none;
    width: 14px;
    height: 14px;
    object-fit: contain;
  }

  .turn-change-icon-fallback {
    font-size: 14px;
    color: var(--frost-muted);
  }

  .turn-change-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .turn-change-stat {
    display: inline-flex;
    flex: none;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 10.5px;
  }

  .turn-changes-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 7px 12px;
    border: 0;
    border-top: 0.5px solid var(--frost-stroke-soft);
    border-radius: 0;
    background: transparent;
    color: var(--frost-muted);
    font-size: 11.5px;
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast) ease;
  }

  .turn-changes-toggle:hover {
    background: var(--frost-hover);
    color: var(--frost-text);
  }

  .stat-add {
    color: var(--vscode-gitDecoration-addedResourceForeground, #89d185);
  }

  .stat-del {
    color: var(--vscode-gitDecoration-deletedResourceForeground, #f48771);
  }
</style>
