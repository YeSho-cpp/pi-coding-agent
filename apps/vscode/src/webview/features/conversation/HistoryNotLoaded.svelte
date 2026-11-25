<script lang="ts">
  import type { SessionViewModel } from "$shared/model/sessionViewModel";
  import { postToHost } from "../../bridge/vscodeBridge";

  let { session }: { session: Pick<SessionViewModel, "id" | "historyStatus" | "isStreaming"> } = $props();

  const failed = $derived(session.historyStatus === "failed");
</script>

<div class="history-gate" role="status">
  <span class="codicon codicon-history history-gate-icon" aria-hidden="true"></span>
  <div class="history-gate-copy">
    <strong>{failed ? "历史加载失败" : "会话历史较大，没有自动加载"}</strong>
    <span>
      {#if session.isStreaming}
        会话正在运行，停止后才能加载历史。
      {:else if failed}
        可以重试，原因见下方提示。
      {:else}
        点击后从磁盘载入完整对话。
      {/if}
    </span>
  </div>
  <button
    type="button"
    class="history-gate-button"
    disabled={session.isStreaming}
    onclick={() => postToHost({ type: "loadHistory", sessionId: session.id })}
  >{failed ? "重试" : "加载历史"}</button>
</div>

<style>
.history-gate {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  width: 100%;
  max-width: 420px;
  margin: 4px auto 12px;
  padding: 9px 11px;
  border: 1px solid var(--frost-border-soft);
  border-radius: 8px;
  background: var(--frost-surface);
  color: var(--frost-muted);
  text-align: left;
  box-sizing: border-box;
}
.history-gate-icon { color: var(--frost-link); font-size: 15px; }
.history-gate-copy {
  flex: 1 1 160px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11.5px;
  line-height: 1.45;
}
.history-gate-copy strong { color: var(--frost-text); font-size: 12px; font-weight: 600; }
.history-gate-button {
  flex: 0 0 auto;
  padding: 3px 11px;
  border: 0;
  border-radius: 6px;
  background: var(--frost-accent);
  color: var(--frost-accent-text);
  font-size: 11px;
  cursor: pointer;
}
.history-gate-button:hover:not(:disabled) { background: var(--frost-accent-hover); }
.history-gate-button:disabled { opacity: 0.42; cursor: default; }
</style>
