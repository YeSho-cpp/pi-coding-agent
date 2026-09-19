<script lang="ts">
  import type { CatalogSessionSummaryView, SessionSummaryView, SessionViewModel } from "$shared/model/sessionViewModel";
  import { postToHost } from "../../bridge/vscodeBridge";

  let {
    session = null,
    sessions = [],
    catalogSessions = [],
    noWorkspace = false,
  }: {
    session?: SessionViewModel | null;
    sessions?: SessionSummaryView[];
    catalogSessions?: CatalogSessionSummaryView[];
    noWorkspace?: boolean;
  } = $props();

  const VISIBLE = 5;
  let expanded = $state(false);
  let draft = $state("");

  type WelcomeItem =
    | { kind: "live"; id: string; title: string; isActive: boolean; status: string; cwdLabel?: string; ephemeral?: boolean }
    | { kind: "catalog"; path: string; title: string; when: string; cwdLabel?: string; preview?: string };

  function formatWhen(ts: number): string {
    const diff = Date.now() - ts;
    if (!Number.isFinite(ts) || ts <= 0) return "";
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "刚刚";
    if (min < 60) return `${min} 分钟前`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    if (days < 30) return `${Math.floor(days / 7)} 周前`;
    if (days < 365) return `${Math.floor(days / 30)} 个月前`;
    return `${Math.floor(days / 365)} 年前`;
  }

  function shortProjectLabel(cwd: string): string {
    if (!cwd) return "历史";
    const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] || "历史";
  }

  function statusLabel(s: SessionSummaryView): string {
    if (s.requiresUserInput) return "需要操作";
    if (s.status === "running") return "运行中";
    if (s.status === "queued") return "排队中";
    if (s.status === "starting") return "启动中";
    if (s.status === "stopping") return "停止中";
    if (s.status === "failed") return "失败";
    if (s.historyStatus === "loading") return "加载历史";
    if (s.historyStatus === "failed") return "历史加载失败";
    return "就绪";
  }

  const allItems = $derived.by<WelcomeItem[]>(() => {
    const live: WelcomeItem[] = sessions.map((s) => ({
      kind: "live",
      id: s.id,
      title: s.title,
      isActive: s.isActive,
      status: statusLabel(s),
      ...(s.workingDirectoryLabel ? { cwdLabel: s.workingDirectoryLabel } : {}),
      ephemeral: s.isEphemeral,
    }));
    const catalog: WelcomeItem[] = (catalogSessions ?? [])
      .filter((c) => c?.path)
      .map((c) => ({
        kind: "catalog",
        path: c.path,
        title: c.title || "未命名会话",
        when: formatWhen(c.updatedAt),
        cwdLabel: shortProjectLabel(c.cwd),
        ...(c.preview ? { preview: c.preview } : {}),
      }));
    return [...live, ...catalog];
  });

  const visibleItems = $derived.by(() => {
    const list = allItems ?? [];
    return expanded ? list : list.slice(0, VISIBLE);
  });
  const hiddenCount = $derived(Math.max(0, (allItems?.length ?? 0) - VISIBLE));
  const hasItems = $derived((allItems?.length ?? 0) > 0);

  function openItem(item: WelcomeItem): void {
    if (menuKey || renameKey) return;
    if (item.kind === "live") {
      postToHost({ type: "activateSession", sessionId: item.id });
      return;
    }
    postToHost({ type: "openCatalogSession", path: item.path });
  }

  function itemKey(item: WelcomeItem): string {
    return item.kind === "live" ? `live:${item.id}` : `catalog:${item.path}`;
  }

  let menuKey = $state<string | null>(null);
  let renameKey = $state<string | null>(null);
  let renameDraft = $state("");

  function toggleMenu(key: string, event: MouseEvent): void {
    event.stopPropagation();
    menuKey = menuKey === key ? null : key;
    renameKey = null;
  }

  function beginRename(item: WelcomeItem, event: MouseEvent): void {
    event.stopPropagation();
    menuKey = null;
    renameKey = itemKey(item);
    renameDraft = item.title;
  }

  function commitRename(item: WelcomeItem): void {
    const name = renameDraft.trim();
    const key = itemKey(item);
    renameKey = null;
    if (!name || name === item.title) return;
    if (item.kind === "live") {
      postToHost({ type: "renameSession", sessionId: item.id, name });
      return;
    }
    postToHost({ type: "renameCatalogSession", path: item.path, name });
  }

  function removeItem(item: WelcomeItem, event: MouseEvent): void {
    event.stopPropagation();
    menuKey = null;
    if (item.kind === "live") {
      postToHost({ type: "closeSession", sessionId: item.id });
      return;
    }
    postToHost({ type: "deleteCatalogSession", path: item.path });
  }

  function createSession(): void {
    postToHost({ type: "createSession" });
  }

  function resumeSession(): void {
    postToHost({ type: "resumeSession" });
  }

  function sendOrStart(): void {
    createSession();
  }

  function onComposerKey(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendOrStart();
    }
  }
</script>

<div class="onboarding-view" class:no-workspace={noWorkspace} class:has-error={session?.status === "failed"}>
  <!-- 1) Big Pi brand mark -->
  <header class="ob-hero">
    <div class="ob-logo" aria-hidden="true">
      <svg viewBox="0 0 800 800" width="120" height="120" role="img">
        <rect width="800" height="800" rx="176" fill="#1C1C1E" />
        <g fill="#ECEFF1">
          <path fill-rule="evenodd" d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z" />
          <path d="M517.36 400H634.72V634.72H517.36Z" />
        </g>
      </svg>
    </div>
  </header>

  {#if noWorkspace}
    <section class="ob-mid">
      <h1>打开工作区</h1>
      <p>Pi Coding Agent 在工作区扩展宿主中运行 Pi，文件、工具与 shell 与当前项目一致。</p>
      <div class="onboarding-actions">
        <button class="tint-primary" type="button" onclick={() => postToHost({ type: "openFolder" })}>
          <span class="codicon codicon-folder-opened"></span> 打开文件夹
        </button>
      </div>
    </section>
  {:else if session?.status === "failed"}
    <section class="ob-mid">
      <h1>Pi 启动失败</h1>
      <p class="onboarding-error">{session.error ?? "未知启动错误"}</p>
      <div class="onboarding-actions">
        {#if !session.isEphemeral}
          <button class="tint-primary" type="button" onclick={() => postToHost({ type: "retryStart", sessionId: session.id })}>
            <span class="codicon codicon-refresh"></span> 重试
          </button>
        {/if}
        <button class="tint-neutral" type="button" onclick={() => postToHost({ type: "configureExecutable" })}>
          <span class="codicon codicon-terminal"></span> 配置 Pi
        </button>
        <button class="tint-neutral" type="button" onclick={() => postToHost({ type: "openSettings" })}>
          <span class="codicon codicon-settings-gear"></span> 设置
        </button>
      </div>
    </section>
  {:else}
    <!-- 2) Session list (runtime + on-disk catalog) -->
    <section class="ob-sessions" aria-label="会话">
      {#if !hasItems}
        <div class="ob-sessions-empty">
          <strong>开始一个 Pi 会话</strong>
          <span>新建对话，或恢复本文件夹下的历史 Pi 会话。</span>
        </div>
      {:else}
        <div class="ob-sessions-head">
          <span class="ob-sessions-title">会话</span>
          <span class="ob-sessions-count">{allItems?.length ?? 0}</span>
        </div>
        <div class="ob-sessions-list">
          {#each visibleItems as item (itemKey(item))}
            {@const key = itemKey(item)}
            <div
              class="ob-session-row"
              class:active={item.kind === "live" && item.isActive}
              role="button"
              tabindex="0"
              title={item.kind === "live" ? item.id : item.path}
              onclick={() => openItem(item)}
              onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openItem(item); } }}
            >
              <span class="ob-session-dot" class:live={item.kind === "live" && (item.status === "运行中" || item.status === "需要操作")}></span>
              <span class="ob-session-copy">
                {#if renameKey === key}
                  <input
                    class="ob-rename-input"
                    bind:value={renameDraft}
                    onclick={(e) => e.stopPropagation()}
                    onkeydown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitRename(item); }
                      if (e.key === "Escape") { e.preventDefault(); renameKey = null; }
                    }}
                    onblur={() => commitRename(item)}
                  />
                {:else}
                  <span class="ob-session-title">
                    {item.title}
                    {#if item.kind === "live" && item.ephemeral}<span class="ephemeral-badge">临时</span>{/if}
                    {#if item.kind === "catalog"}<span class="ephemeral-badge">历史</span>{/if}
                  </span>
                {/if}
                <span class="ob-session-meta">
                  {#if item.cwdLabel}
                    <span class="session-cwd-pill">{item.cwdLabel}</span>
                  {/if}
                  <span class:attention={item.kind === "live" && item.status === "需要操作"}>
                    {item.kind === "live" ? item.status : item.when}
                  </span>
                </span>
              </span>
              <button
                type="button"
                class="ob-session-more"
                aria-label="会话更多操作"
                title="更多"
                onclick={(e) => toggleMenu(key, e)}
              >
                <span class="codicon codicon-ellipsis" aria-hidden="true"></span>
              </button>
              {#if menuKey === key}
                <div class="ob-session-menu" role="menu">
                  <button type="button" role="menuitem" onclick={(e) => beginRename(item, e)}>
                    <span class="codicon codicon-edit" aria-hidden="true"></span> 重命名会话
                  </button>
                  <button type="button" role="menuitem" class="danger" onclick={(e) => removeItem(item, e)}>
                    <span class="codicon codicon-trash" aria-hidden="true"></span> 删除会话
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        {#if hiddenCount > 0 && !expanded}
          <button type="button" class="ob-more" onclick={() => (expanded = true)}>
            <span>更多</span>
            <span class="ob-more-count">{hiddenCount}</span>
          </button>
        {:else if expanded && (allItems?.length ?? 0) > VISIBLE}
          <button type="button" class="ob-more" onclick={() => (expanded = false)}>
            <span>收起</span>
          </button>
        {/if}
      {/if}

      <div class="ob-session-actions">
        <button class="tint-primary" type="button" onclick={createSession}>
          <span class="codicon codicon-add"></span> 新建会话
        </button>
        {#if hasItems}
          <button class="tint-neutral" type="button" onclick={resumeSession}>
            <span class="codicon codicon-history"></span> 恢复会话
          </button>
        {/if}
      </div>
    </section>
  {/if}

  <!-- 3) Composer strip -->
  {#if !noWorkspace && session?.status !== "failed"}
    <footer class="ob-composer" aria-label="输入">
      <div class="ob-composer-box">
        <textarea
          class="ob-composer-input"
          rows="2"
          placeholder="与 Pi 对话… Enter 新建会话"
          bind:value={draft}
          onkeydown={onComposerKey}
        ></textarea>
        <div class="ob-composer-bar">
          <button class="ob-icon-btn" type="button" title="新建会话" aria-label="新建会话" onclick={createSession}>
            <span class="codicon codicon-add"></span>
          </button>
          <span class="ob-composer-hint">会话与终端 <code>pi</code> 共用存储</span>
          <button class="ob-send" type="button" title="新建会话并开始" aria-label="发送" onclick={sendOrStart}>
            <span class="codicon codicon-arrow-up"></span>
          </button>
        </div>
      </div>
    </footer>
  {/if}
</div>

<style>
  .onboarding-view {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0;
    padding: 12px 14px 12px;
  }

  .ob-hero {
    display: flex;
    justify-content: center;
    padding: 18px 0 14px;
  }
  .ob-logo {
    line-height: 0;
    filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.35));
  }

  .ob-mid {
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 12px 16px;
    text-align: center;
  }
  .ob-mid :global(h1) {
    margin: 4px 0 6px;
    font-size: 16px;
    font-weight: 600;
  }
  .ob-mid :global(p) {
    max-width: 420px;
    margin: 0 0 14px;
    color: var(--frost-muted);
    font-size: 12px;
    line-height: 1.55;
  }
  .onboarding-error {
    max-height: 140px;
    overflow: auto;
    padding: 10px 12px !important;
    background: color-mix(in srgb, var(--frost-error) 8%, var(--frost-surface));
    border: 1px solid color-mix(in srgb, var(--frost-error) 30%, var(--frost-border));
    border-radius: 10px;
    color: var(--frost-error) !important;
    text-align: left;
    white-space: pre-wrap;
    font-family: var(--font-mono);
    font-size: 11px !important;
  }

  .ob-sessions {
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 2px 8px;
  }
  .ob-sessions-empty {
    flex: 1;
    min-height: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--frost-muted);
    text-align: center;
  }
  .ob-sessions-empty strong {
    color: var(--frost-text);
    font-size: 14px;
    font-weight: 600;
  }
  .ob-sessions-empty span {
    font-size: 11.5px;
  }
  .ob-sessions-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 6px 0;
  }
  .ob-sessions-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--frost-muted);
  }
  .ob-sessions-count {
    font-size: 10px;
    color: var(--frost-faint);
  }
  .ob-sessions-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ob-session-row {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 8px 6px 8px 8px;
    border-radius: 8px;
    background: transparent;
    color: var(--frost-text);
    cursor: pointer;
    position: relative;
  }
  .ob-session-row:hover,
  .ob-session-row.active {
    background: var(--frost-hover);
  }
  .ob-session-more {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--frost-muted);
    cursor: pointer;
    opacity: 0.55;
  }
  .ob-session-row:hover .ob-session-more,
  .ob-session-more:focus-visible {
    opacity: 1;
  }
  .ob-session-more:hover {
    color: var(--frost-text);
    background: var(--frost-hover);
  }
  .ob-session-menu {
    position: absolute;
    top: calc(100% - 4px);
    right: 6px;
    z-index: 30;
    min-width: 148px;
    padding: 4px;
    border: 1px solid var(--frost-border);
    border-radius: 8px;
    background: var(--frost-surface-raised);
    box-shadow: var(--frost-shadow);
  }
  .ob-session-menu button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--frost-text);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .ob-session-menu button:hover {
    background: var(--frost-hover);
  }
  .ob-session-menu button.danger {
    color: var(--frost-error);
  }
  .ob-rename-input {
    width: 100%;
    min-width: 0;
    height: 24px;
    padding: 2px 6px;
    border: 1px solid var(--frost-focus);
    border-radius: 5px;
    background: var(--frost-input-bg);
    color: var(--frost-text);
    font-size: 12.5px;
  }
  .ob-session-dot {
    margin-top: 6px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--frost-muted) 55%, transparent);
  }
  .ob-session-dot.live {
    background: var(--frost-success);
  }
  .ob-session-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .ob-session-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
    font-weight: 550;
  }
  .ephemeral-badge {
    margin-left: 4px;
    padding: 0 4px;
    border: 1px solid var(--frost-border);
    border-radius: 4px;
    color: var(--frost-muted);
    font-size: 9px;
    font-weight: 400;
  }
  .ob-session-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--frost-muted);
    font-size: 10.5px;
  }
  .ob-session-meta .attention {
    color: var(--frost-warning);
  }
  .ob-more {
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--frost-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .ob-more:hover {
    color: var(--frost-text);
    background: var(--frost-hover);
  }
  .ob-more-count {
    color: var(--frost-faint);
    font-variant-numeric: tabular-nums;
  }
  .ob-session-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding: 8px 0 2px;
  }
  .onboarding-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .ob-session-actions :global(button),
  .onboarding-actions :global(button) {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 13px;
    border-radius: 10px;
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }
  .tint-primary {
    background: color-mix(in srgb, var(--frost-accent) 16%, transparent);
    border-color: color-mix(in srgb, var(--frost-accent) 28%, transparent) !important;
    color: var(--frost-accent);
  }
  .tint-primary:hover {
    background: color-mix(in srgb, var(--frost-accent) 24%, transparent);
  }
  .tint-neutral {
    background: color-mix(in srgb, var(--frost-secondary-bg) 80%, transparent);
    border-color: var(--frost-border-soft) !important;
    color: var(--frost-text);
  }
  .tint-neutral:hover {
    background: var(--frost-secondary-hover);
  }

  .ob-composer {
    padding-top: 4px;
  }
  .ob-composer-box {
    border: 1px solid var(--frost-input-border);
    border-radius: 12px;
    background: var(--frost-surface);
    overflow: hidden;
  }
  .ob-composer-box:focus-within {
    border-color: var(--frost-focus);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--frost-focus) 28%, transparent);
  }
  .ob-composer-input {
    display: block;
    width: 100%;
    min-height: 52px;
    max-height: 120px;
    resize: vertical;
    padding: 12px 14px 4px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--frost-text);
    font: inherit;
    font-size: 12.5px;
    line-height: 1.45;
  }
  .ob-composer-input::placeholder {
    color: var(--frost-faint);
  }
  .ob-composer-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 8px;
  }
  .ob-icon-btn {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px dashed color-mix(in srgb, var(--frost-focus) 40%, var(--frost-border-soft));
    border-radius: 8px;
    background: transparent;
    color: var(--frost-muted);
    cursor: pointer;
  }
  .ob-icon-btn:hover {
    color: var(--frost-text);
    border-color: var(--frost-focus);
    background: var(--frost-hover);
  }
  .ob-composer-hint {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--frost-faint);
    font-size: 10.5px;
  }
  .ob-composer-hint code {
    font-family: var(--font-mono);
  }
  .ob-send {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: var(--frost-accent);
    color: var(--frost-accent-text);
    cursor: pointer;
  }
  .ob-send:hover {
    background: var(--frost-accent-hover);
  }
</style>
