<script lang="ts">
  import type { AgentTurnItemView, AgentTurnView } from "$shared/model/conversationModel";
  import type { SessionViewModel } from "$shared/model/sessionViewModel";

  import { formatTraceSummaryLabel, planTurnItems } from "./collapseTurnTrace";
  import BranchPointControl from "./BranchPointControl.svelte";
  import BranchSummaryBlock from "./BranchSummaryBlock.svelte";
  import CompactionBlock from "./CompactionBlock.svelte";
  import CustomBlock from "./CustomBlock.svelte";
  import { LIVE_EXPAND_DELAY_MS, liveStepId } from "./liveStep";
  import ResponseActivity from "./ResponseActivity.svelte";
  import SessionNotice from "./SessionNotice.svelte";
  import ThinkingActivity from "./ThinkingActivity.svelte";
  import ToolActivity from "./ToolActivity.svelte";
  import TurnChangesStrip from "./TurnChangesStrip.svelte";
  import TurnTiming from "./TurnTiming.svelte";
  import UserMessage from "./UserMessage.svelte";
  import { summarizeTurnChanges } from "./turnChanges";

  let { turn, session }: { turn: AgentTurnView; session: SessionViewModel } = $props();
  let traceOpen = $state(false);

  const plan = $derived(planTurnItems(turn, session.collapseTurnTrace));
  const summaryLabel = $derived(plan.mode === "collapsed" ? formatTraceSummaryLabel(plan.summary) : "");
  const changes = $derived(summarizeTurnChanges(turn));
  const changeTotals = $derived({
    added: changes.reduce((sum, file) => sum + file.added, 0),
    removed: changes.reduce((sum, file) => sum + file.removed, 0),
  });
  const changeLabel = $derived(
    changes.length === 0
      ? ""
      : `${changes.length} ${changes.length === 1 ? "file" : "files"} changed, +${changeTotals.added} -${changeTotals.removed}`,
  );

  /** The step in progress, and the step that has stayed in progress long enough to unfold. */
  const activeStepId = $derived(liveStepId(turn));
  let settledStepId = $state<string | null>(null);
  const unfoldedStepId = $derived(settledStepId !== null && settledStepId === activeStepId ? settledStepId : null);

  $effect(() => {
    if (plan.mode !== "collapsed") traceOpen = false;
  });

  $effect(() => {
    const candidate = activeStepId;
    settledStepId = null;
    if (candidate === null) return;
    const timer = window.setTimeout(() => {
      settledStepId = candidate;
    }, LIVE_EXPAND_DELAY_MS);
    return () => window.clearTimeout(timer);
  });
</script>

<section class="agent-turn" data-turn-id={turn.id}>
  {#if turn.userMessage}<UserMessage message={turn.userMessage} {session} />{/if}
  {#if turn.status === "running"}<TurnTiming startedAt={turn.startedAt} />{/if}
  <div class="turn-activities" class:trace-open={plan.mode === "collapsed" && traceOpen}>
    {#each turn.items as item (item.id)}
      {#if plan.mode === "collapsed" && item.id === plan.firstCollapsedItemId}
        <div class="turn-trace-header">
          <button
            type="button"
            class="activity-trigger"
            aria-expanded={traceOpen}
            aria-label={`${traceOpen ? "Collapse" : "Expand"} work trace: ${summaryLabel}${changeLabel ? `, ${changeLabel}` : ""}`}
            onclick={() => traceOpen = !traceOpen}
          >
            <span class="codicon codicon-list-tree activity-leading" aria-hidden="true"></span>
            <span class="activity-title">{plan.stateLabel}</span>
            <span class="turn-trace-meta">{summaryLabel}</span>
            {#if changes.length > 0}
              <span class="turn-trace-changes" title={changeLabel}>
                <span class="turn-trace-files">{changes.length} {changes.length === 1 ? "file" : "files"}</span>
                <span class="stat-add">+{changeTotals.added}</span>
                <span class="stat-del">-{changeTotals.removed}</span>
              </span>
            {/if}
            <span class={`codicon codicon-chevron-${traceOpen ? "down" : "right"} activity-chevron`} aria-hidden="true"></span>
          </button>
        </div>
      {/if}

      {#if plan.mode === "collapsed" && traceOpen && item.id === plan.anchorItemId}
        <button
          type="button"
          class="turn-trace-break"
          aria-label={`${traceOpen ? "Collapse" : "Expand"} work trace`}
          onclick={() => traceOpen = !traceOpen}
        >
          <span class="turn-trace-break-line" aria-hidden="true"></span>
          <span class="turn-trace-break-label">{plan.anchorLabel}</span>
          <span class="turn-trace-break-line" aria-hidden="true"></span>
        </button>
      {/if}

      {#if plan.mode !== "collapsed" || !plan.collapsedItemIds.has(item.id) || traceOpen}
        {@render turnItemRow(item)}
      {/if}
    {/each}
    {#if changes.length > 0}
      <TurnChangesStrip files={changes} cwd={session.cwd} />
    {/if}
  </div>
</section>

{#snippet turnItemRow(item: AgentTurnItemView)}
  {#if item.type === "reasoning"}
    <ThinkingActivity activity={item} active={item.id === activeStepId} live={item.id === unfoldedStepId} />
  {:else if item.type === "tool"}
    <ToolActivity activity={item} live={item.id === unfoldedStepId} />
  {:else if item.type === "response"}
    <ResponseActivity
      activity={item}
      sessionId={session.id}
      {session}
      entryId={turn.userMessage?.sourceEntryId}
    />
  {:else if item.type === "notice"}
    <SessionNotice notice={item} />
  {:else if item.type === "compaction"}
    <CompactionBlock compaction={item} />
  {:else if item.type === "branchSummary"}
    <BranchSummaryBlock summary={item} />
  {:else if item.type === "customMessage"}
    <CustomBlock message={item} />
  {:else}
    <BranchPointControl control={item} {session} />
  {/if}
{/snippet}

<style>
  .turn-trace-header {
    min-width: 0;
    color: var(--frost-muted);
  }

  .turn-trace-meta {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--frost-faint);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .turn-trace-changes {
    display: inline-flex;
    flex: none;
    align-items: baseline;
    gap: 5px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .turn-trace-files { color: var(--frost-faint); }
  .stat-add { color: var(--vscode-gitDecoration-addedResourceForeground, #3fb950); }
  .stat-del { color: var(--vscode-gitDecoration-deletedResourceForeground, #f85149); }

  .turn-trace-break {
    display: grid;
    grid-template-columns: minmax(12px, 1fr) auto minmax(12px, 1fr);
    align-items: center;
    gap: 8px;
    width: 100%;
    margin: 4px 2px 6px;
    padding: 2px;
    min-width: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    transition: background var(--motion-fast) ease;
  }

  .turn-trace-break:hover {
    background: color-mix(in srgb, var(--frost-surface) 48%, transparent);
  }

  .turn-trace-break:hover .turn-trace-break-line {
    background: var(--frost-border);
  }

  .turn-trace-break:hover .turn-trace-break-label {
    color: var(--frost-muted);
  }

  .turn-trace-break-line {
    height: 1px;
    background: var(--frost-border-soft);
  }

  .turn-trace-break-label {
    color: var(--frost-faint);
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    user-select: none;
  }

  .agent-turn { margin: 0 0 22px; }
  .agent-turn:last-of-type { margin-bottom: 8px; }
  .agent-turn :global(.message-user) { margin-bottom: 11px; }
  .turn-activities { display: grid; gap: 2px; min-width: 0; }

  @media (max-width: 430px) {
    .agent-turn { margin-bottom: 18px; }
  }
</style>
