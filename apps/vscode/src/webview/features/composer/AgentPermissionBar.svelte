<script lang="ts">
  import type { SessionViewModel } from "$shared/model/sessionViewModel";

  import { postToHost } from "../../bridge/vscodeBridge";

  let { session }: { session: SessionViewModel } = $props();

  const mode = $derived(session.agentPermissionMode ?? "ask");
  const pendingConfirm = $derived(
    session.pendingExtensionUi.filter((r) => r.method === "confirm").length,
  );
  const pendingAll = $derived(session.pendingExtensionUi.length);
  const running = $derived(session.isStreaming);

  const modeLabel = $derived(
    mode === "autoConfirm" ? "自动确认"
      : mode === "restricted" ? "受限(无 bash/写)"
        : "询问确认",
  );
  const modeTitle = $derived(
    mode === "autoConfirm"
      ? "Pi extension confirm dialogs are auto-approved. select/input still require you."
      : mode === "restricted"
        ? "Sessions launched without bash/edit/write tools. Restart session after changing this."
        : "Default: Pi confirmation cards are shown (like Copilot Default permissions).",
  );

  function cycleMode(): void {
    const next = mode === "ask" ? "autoConfirm" : mode === "autoConfirm" ? "restricted" : "ask";
    postToHost({ type: "setAgentPermissionMode", mode: next });
  }

  function openSettings(): void {
    postToHost({ type: "openSettings" });
  }
</script>

<div class="agent-permission-bar" role="status" aria-live="polite">
  <button
    type="button"
    class="agent-permission-chip"
    class:mode-auto={mode === "autoConfirm"}
    class:mode-restricted={mode === "restricted"}
    class:needs-input={pendingConfirm > 0}
    title={`${modeTitle} · Click to cycle mode`}
    onclick={cycleMode}
  >
    <span class="codicon codicon-shield" aria-hidden="true"></span>
    <span class="agent-permission-label">{modeLabel}</span>
  </button>

  {#if pendingAll > 0}
    <button type="button" class="agent-permission-pending" title="Pi waiting for your confirmation" onclick={openSettings}>
      <span class="codicon codicon-warning" aria-hidden="true"></span>
      <span>需要确认 ×{pendingAll}</span>
    </button>
  {/if}

  {#if running}
    <span class="agent-permission-run">
      <span class="codicon codicon-history" aria-hidden="true"></span>
      <span>Agent running</span>
      <span class="run-dot" aria-hidden="true"></span>
    </span>
  {/if}

  <span class="agent-permission-hint">Pi tools · {session.sessionTreeAvailable ? "tree ok" : "tree n/a"}</span>
</div>

<style>
  .agent-permission-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 4px 2px 2px;
    font-size: 10.5px;
  }
  .agent-permission-hint {
    margin-left: 4px;
    color: var(--frost-faint);
    font-size: 9.5px;
  }
  .agent-permission-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 9px;
    border: 1px solid color-mix(in srgb, var(--frost-accent) 28%, var(--frost-border-soft));
    border-radius: 999px;
    background: color-mix(in srgb, var(--frost-accent) 10%, transparent);
    color: var(--frost-text);
    font-size: 10.5px;
    cursor: pointer;
  }
  .agent-permission-chip:hover { background: color-mix(in srgb, var(--frost-accent) 18%, transparent); }
  .agent-permission-chip.mode-auto {
    border-color: color-mix(in srgb, var(--frost-warning) 40%, var(--frost-border));
    background: color-mix(in srgb, var(--frost-warning) 12%, transparent);
  }
  .agent-permission-chip.mode-restricted {
    border-color: color-mix(in srgb, var(--frost-error) 35%, var(--frost-border));
    background: color-mix(in srgb, var(--frost-error) 10%, transparent);
  }
  .agent-permission-chip.needs-input {
    border-color: color-mix(in srgb, var(--frost-error) 50%, transparent);
  }
  .agent-permission-chip :global(.codicon) { color: var(--frost-muted); font-size: 12px; }
  .agent-permission-chip.mode-auto :global(.codicon) { color: var(--frost-warning); }
  .agent-permission-pending {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--frost-error) 40%, var(--frost-border));
    background: color-mix(in srgb, var(--frost-error) 12%, transparent);
    color: var(--frost-error);
    font-size: 10.5px;
    cursor: pointer;
  }
  .agent-permission-run {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--frost-muted);
  }
  .run-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--frost-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--frost-accent) 18%, transparent);
  }
</style>
