<script lang="ts">
  import type { SessionSummaryView, SessionViewModel } from "$shared/model/sessionViewModel";
  import { postToHost } from "../../bridge/vscodeBridge";

  let {
    session = null,
    sessions = [],
    noWorkspace = false,
  }: {
    session?: SessionViewModel | null;
    sessions?: SessionSummaryView[];
    noWorkspace?: boolean;
  } = $props();

  const VISIBLE = 5;
  let expanded = $state(false);
  let draft = $state("");

  const visibleSessions = $derived(expanded ? sessions : sessions.slice(0, VISIBLE));
  const hiddenCount = $derived(Math.max(0, sessions.length - VISIBLE));

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

  function openSession(id: string): void {
    postToHost({ type: "activateSession", sessionId: id });
  }

  function createSession(): void {
    postToHost({ type: "createSession" });
  }

  function resumeSession(): void {
    postToHost({ type: "resumeSession" });
  }

  function sendOrStart(): void {
    // Session opens; type the first prompt in the session composer.
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
    <!-- 2) Session list (same store as terminal pi) -->
    <section class="ob-sessions" aria-label="会话">
      {#if sessions.length === 0}
        <div class="ob-sessions-empty">
          <strong>开始一个 Pi 会话</strong>
          <span>新建对话，或恢复本工作区的历史会话。</span>
        </div>
      {:else}
        <div class="ob-sessions-head">
          <span class="ob-sessions-title">会话</span>
          <span class="ob-sessions-count">{sessions.length}</span>
        </div>
        <div class="ob-sessions-list">
          {#each visibleSessions as s (s.id)}
            <button
              type="button"
              class="ob-session-item"
              class:active={s.isActive}
              title={s.cwd}
              onclick={() => openSession(s.id)}
            >
              <span class="ob-session-dot" class:live={s.status === "running" || s.requiresUserInput}></span>
              <span class="ob-session-copy">
                <span class="ob-session-title">
                  {s.title}
                  {#if s.isEphemeral}<span class="ephemeral-badge">临时</span>{/if}
                </span>
                <span class="ob-session-meta">
                  {#if s.workingDirectoryLabel}
                    <span class="session-cwd-pill">{s.workingDirectoryLabel}</span>
                  {/if}
                  <span class:attention={s.requiresUserInput}>{statusLabel(s)}</span>
                </span>
              </span>
            </button>
          {/each}
        </div>
        {#if hiddenCount > 0 && !expanded}
          <button type="button" class="ob-more" onclick={() => (expanded = true)}>
            <span>更多</span>
            <span class="ob-more-count">{hiddenCount}</span>
          </button>
        {:else if expanded && sessions.length > VISIBLE}
          <button type="button" class="ob-more" onclick={() => (expanded = false)}>
            <span>收起</span>
          </button>
        {/if}
      {/if}

      <div class="ob-session-actions">
        <button class="tint-primary" type="button" onclick={createSession}>
          <span class="codicon codicon-add"></span> 新建会话
        </button>
        {#if sessions.length > 0}
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
  .ob-session-item {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    padding: 8px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--frost-text);
    text-align: left;
    cursor: pointer;
  }
  .ob-session-item:hover,
  .ob-session-item.active {
    background: var(--frost-hover);
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
