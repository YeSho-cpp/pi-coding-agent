<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import {
    applyFindHighlights,
    clearFindHighlights,
    collectFindRanges,
    findPosition,
    revealFindRange,
  } from "./findInConversation";

  let {
    container,
    revision,
    onclose,
  }: {
    /** The message tree to search; the bar renders after the frame has bound it. */
    container: HTMLElement | null;
    /** Bumped by the conversation on every content change so matches track the stream. */
    revision: number;
    onclose: () => void;
  } = $props();

  let query = $state("");
  let ranges = $state<Range[]>([]);
  let active = $state(-1);
  let input = $state<HTMLInputElement | null>(null);

  onMount(() => input?.focus());
  onDestroy(clearFindHighlights);

  // Collects on every keystroke and on every content revision. Writing ranges/active here is
  // safe: this effect never reads them, so it cannot re-trigger itself.
  $effect(() => {
    void revision;
    const nextQuery = query;
    const target = container;
    if (!target || !nextQuery) {
      ranges = [];
      active = -1;
      return;
    }
    const next = collectFindRanges(target, nextQuery);
    const nextActive = next.length > 0 ? 0 : -1;
    ranges = next;
    active = nextActive;
    if (nextActive >= 0) revealFindRange(next[nextActive]!);
  });

  // Painting reads only ranges/active, so moving between matches repaints without re-collecting.
  $effect(() => {
    applyFindHighlights(ranges, active);
  });

  function goTo(delta: number): void {
    if (ranges.length === 0) return;
    const next = (active + delta + ranges.length) % ranges.length;
    active = next;
    revealFindRange(ranges[next]!);
  }

  const position = $derived(findPosition(active, ranges.length));
  const total = $derived(ranges.length);
</script>

<div class="find-bar" role="search" aria-label="Find in conversation">
  <input
    bind:this={input}
    class="find-input"
    type="text"
    placeholder="Find in conversation"
    spellcheck="false"
    autocomplete="off"
    bind:value={query}
    onkeydown={(event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      goTo(event.shiftKey ? -1 : 1);
    }}
  />
  <span class="find-count" class:find-count-empty={query.length > 0 && total === 0}>
    {#if query.length === 0}{:else if total === 0}No results{:else}{position} / {total}{/if}
  </span>
  <button
    type="button"
    class="find-button"
    aria-label="Previous match"
    title="Previous match (Shift+Enter)"
    disabled={total === 0}
    onclick={() => goTo(-1)}
  >
    <span class="codicon codicon-chevron-up" aria-hidden="true"></span>
  </button>
  <button
    type="button"
    class="find-button"
    aria-label="Next match"
    title="Next match (Enter)"
    disabled={total === 0}
    onclick={() => goTo(1)}
  >
    <span class="codicon codicon-chevron-down" aria-hidden="true"></span>
  </button>
  <button type="button" class="find-button" aria-label="Close find" title="Close (Escape)" onclick={onclose}>
    <span class="codicon codicon-close" aria-hidden="true"></span>
  </button>
</div>

<style>
  .find-bar {
    position: absolute;
    z-index: 12;
    top: 8px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--frost-border);
    border-radius: var(--radius-sm);
    background: var(--frost-surface-raised);
    box-shadow: var(--frost-shadow);
  }
  .find-input {
    width: min(180px, 34vw);
    height: 22px;
    padding: 0 6px;
    border: 1px solid var(--frost-border-soft);
    border-radius: var(--radius-xs);
    background: var(--frost-input-bg);
    color: var(--frost-text);
    font-size: 11.5px;
  }
  .find-input:focus {
    outline: none;
    border-color: var(--frost-focus);
  }
  .find-input::placeholder {
    color: var(--frost-muted);
  }
  .find-count {
    min-width: 44px;
    padding: 0 4px;
    color: var(--frost-muted);
    font-size: 10.5px;
    text-align: center;
    white-space: nowrap;
  }
  .find-count-empty {
    color: var(--frost-warning);
  }
  .find-button {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--frost-muted);
    cursor: pointer;
  }
  .find-button:hover:not(:disabled) {
    background: var(--frost-hover);
    color: var(--frost-text);
  }
  .find-button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .find-button .codicon {
    font-size: 14px;
  }
</style>
