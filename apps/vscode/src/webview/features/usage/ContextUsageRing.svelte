<script lang="ts">
  import type { SessionViewModel } from "$shared/model/sessionViewModel";

  import { postToHost } from "../../bridge/vscodeBridge";
  import { showToast } from "../../state/sessionViewStore.svelte";

  let { session }: { session: SessionViewModel } = $props();
  let open = $state(false);
  let closeTimer: number | undefined;

  const stats = $derived(session.stats);
  const context = $derived(stats?.contextUsage);
  const percent = $derived(
    context?.percent == null
      ? stats
        ? context?.contextWindow
          ? Math.min(100, Math.round(((context.tokens ?? stats.tokens.total) / context.contextWindow) * 100))
          : null
        : null
      : Math.round(context.percent),
  );
  const radius = 8;
  const circumference = $derived(2 * Math.PI * radius);
  const dash = $derived(percent == null ? 0 : (percent / 100) * circumference);
  const compacting = $derived(session.isCompacting);

  function show(): void {
    if (closeTimer) window.clearTimeout(closeTimer);
    open = true;
  }

  function scheduleClose(): void {
    closeTimer = window.setTimeout(() => { open = false; }, 140);
  }

  function compactContext(): void {
    if (compacting || session.status !== "ready") {
      showToast("warning", session.isCompacting ? "Already compacting…" : "Wait until the session is idle.");
      return;
    }
    postToHost({
      type: "sendPrompt",
      requestId: `compact-${Date.now()}`,
      sessionId: session.id,
      text: "/compact",
      images: [],
      draftRevision: 0,
      streamingBehavior: "followUp",
    });
    open = false;
  }
</script>

<div
  class="context-ring-wrap"
  role="presentation"
  onmouseenter={show}
  onmouseleave={scheduleClose}
>
  <button
    class="context-ring"
    type="button"
    class:compacting
    aria-expanded={open}
    aria-label={`Context usage ${percent == null ? "unknown" : `${percent}%`}. Click to compact.`}
    title="上下文 · 点击压缩"
    onfocus={show}
    onblur={scheduleClose}
    onclick={compactContext}
  >
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r={radius} fill="none" stroke="var(--frost-stroke)" stroke-width="2" />
      <circle
        cx="11"
        cy="11"
        r={radius}
        fill="none"
        stroke={percent != null && percent >= 80 ? "var(--frost-error)" : "var(--frost-accent)"}
        stroke-width="2"
        stroke-linecap="round"
        style="transition: stroke-dasharray var(--motion-slow) var(--ease-standard), stroke var(--motion-normal)"
        stroke-dasharray={`${dash} ${circumference}`}
        transform="rotate(-90 11 11)"
      />
    </svg>
  </button>

  {#if open && stats}
    <div
      class="context-ring-popover"
      role="dialog"
      tabindex="-1"
      aria-label="上下文信息"
      onmouseenter={show}
      onmouseleave={scheduleClose}
    >
      <div class="popover-head">
        <span class="popover-pct" class:hot={percent != null && percent >= 80}>{percent == null ? "—" : `${percent}%`}</span>
        <span class="popover-sub">
          {#if context?.tokens != null && context.contextWindow}
            {compactNumber(context.tokens)} / {compactNumber(context.contextWindow)}
          {:else}
            上下文信息
          {/if}
        </span>
      </div>
      <div class="usage-track" aria-hidden="true">
        <span class:hot={percent != null && percent >= 80} style:width={`${percent ?? 0}%`}></span>
      </div>
      <div class="row">
        <span>Token</span>
        <strong>
          {#if context?.tokens != null && context.contextWindow}
            {compactNumber(context.tokens)} / {compactNumber(context.contextWindow)} ({percent}%)
          {:else if context?.tokens != null}
            {compactNumber(context.tokens)}
          {:else}
            {compactNumber(stats.tokens.total)}
          {/if}
        </strong>
      </div>
      <div class="row">
        <span>输入 / 输出</span>
        <strong>{compactNumber(stats.tokens.input)} / {compactNumber(stats.tokens.output)}</strong>
      </div>
      <div class="row">
        <span>缓存读取 / 写入</span>
        <strong>{compactNumber(stats.tokens.cacheRead)} / {compactNumber(stats.tokens.cacheWrite)}</strong>
      </div>
      <div class="row">
        <span>消息 / 工具</span>
        <strong>{stats.userMessages + stats.assistantMessages} / {stats.toolCalls}</strong>
      </div>
      <button type="button" class="compact-btn" disabled={compacting || session.status !== "ready"} onclick={compactContext}>
        {compacting ? "压缩中…" : "点击压缩上下文"}
      </button>
      <div class="popover-hint">右键或设置里可查看权限模式</div>
    </div>
  {/if}
</div>

<script lang="ts" module>
  const full = new Intl.NumberFormat();
  const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

  function compactNumber(value: number): string {
    if (!Number.isFinite(value)) return "—";
    return Math.abs(value) >= 10_000 ? compact.format(value) : full.format(value);
  }
</script>

<style>
  .context-ring-wrap {
    position: relative;
    flex: none;
  }
  .context-ring {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--frost-muted);
    cursor: pointer;
  }
  .context-ring { transition: background var(--motion-fast) var(--ease-standard); }
  .context-ring:hover { background: var(--frost-hover); }
  .context-ring.compacting svg circle:last-child {
    animation: ring-pulse 1s ease-in-out infinite;
  }
  @keyframes ring-pulse {
    50% { opacity: 0.45; }
  }
  .context-ring-popover {
    position: absolute;
    z-index: 70;
    right: 0;
    bottom: calc(100% + 6px);
    width: min(264px, calc(100vw - 20px));
    padding: 14px 14px 11px;
    border: 0;
    border-radius: 14px;
    background: var(--frost-surface-raised);
    box-shadow: var(--frost-elev-popover);
    font-size: 12px;
    animation: ring-pop var(--motion-fast) var(--ease-standard);
  }
  @keyframes ring-pop {
    from { opacity: 0; transform: translateY(3px); }
  }
  .popover-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
  }
  .popover-pct {
    font-size: 18px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .popover-pct.hot { color: var(--frost-error); }
  .popover-sub {
    color: var(--frost-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .usage-track {
    height: 4px;
    margin-bottom: 9px;
    border-radius: 2px;
    background: var(--frost-skeleton);
    overflow: hidden;
  }
  .usage-track > span {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--frost-accent);
    transition: width var(--motion-slow) var(--ease-standard);
  }
  .usage-track > span.hot { background: var(--frost-error); }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 3px 0;
  }
  .row > span { color: var(--frost-muted); }
  .row > strong {
    color: var(--frost-text);
    font-family: var(--font-mono);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .compact-btn {
    width: 100%;
    margin-top: 10px;
    padding: 7px 8px;
    border: 0;
    border-radius: 7px;
    background: color-mix(in srgb, var(--frost-accent) 18%, transparent);
    color: var(--frost-accent);
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
  }
  .compact-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--frost-accent) 28%, transparent);
  }
  .compact-btn:disabled { opacity: 0.45; cursor: default; }
  .popover-hint {
    margin-top: 6px;
    text-align: center;
    color: var(--frost-faint);
    font-size: 10px;
  }
</style>
