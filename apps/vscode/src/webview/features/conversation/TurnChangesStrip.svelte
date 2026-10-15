<script lang="ts">
  import { postToHost } from "../../bridge/vscodeBridge";
  import { requestFileIcon } from "./markdown/fileIconClient";
  import type { TurnChangeFile } from "./turnChanges";

  let { files, cwd }: { files: TurnChangeFile[]; cwd: string } = $props();

  const totalAdded = $derived(files.reduce((sum, file) => sum + file.added, 0));
  const totalRemoved = $derived(files.reduce((sum, file) => sum + file.removed, 0));
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

  function openDiff(path: string): void {
    const absolute = isAbsolutePath(path) ? path : `${cwd.replace(/[\\/]+$/, "")}/${path}`;
    postToHost({ type: "openDiff", path: absolute });
  }
</script>

<div class="turn-changes" role="group" aria-label="Changed files">
  <div class="turn-changes-head">
    <span class="turn-changes-title">已更改 {files.length} 个文件</span>
    <span class="turn-changes-total">
      <span class="stat-add">+{totalAdded}</span>
      <span class="stat-del">-{totalRemoved}</span>
    </span>
  </div>
  <div class="turn-changes-list">
    {#each files as file (file.path)}
      <button type="button" class="turn-change-row" title={file.path} onclick={() => openDiff(file.path)}>
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
</div>

<style>
  .turn-changes {
    min-width: 0;
    margin-top: 6px;
    padding: 8px 10px 6px;
    border: 1px solid var(--frost-border-soft);
    border-radius: 8px;
    background: color-mix(in srgb, var(--frost-surface) 72%, transparent);
  }

  .turn-changes-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }

  .turn-changes-title {
    color: var(--frost-muted);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .turn-changes-total {
    font-family: var(--font-mono);
    font-size: 10.5px;
  }

  .turn-changes-list {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .turn-change-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    width: 100%;
    padding: 3px 4px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--frost-text);
    font-size: 11.5px;
    text-align: left;
    cursor: pointer;
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
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .turn-change-stat {
    flex: none;
    font-family: var(--font-mono);
    font-size: 10.5px;
  }

  .stat-add {
    color: var(--vscode-gitDecoration-addedResourceForeground, #89d185);
  }

  .stat-del {
    color: var(--vscode-gitDecoration-deletedResourceForeground, #f48771);
  }
</style>
