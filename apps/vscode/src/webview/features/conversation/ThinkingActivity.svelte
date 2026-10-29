<script lang="ts">
  import { Collapsible } from "bits-ui";
  import type { ReasoningActivityView } from "$shared/model/conversationModel";

  import MarkdownContent from "./MarkdownContent.svelte";
  import { reasoningPreview } from "./reasoningPreview";
  import { stickToEnd } from "./stickToEnd";

  /**
   * `active` says the model is writing this reasoning right now; unset, the message status decides.
   * `live` says the running turn settled on this step, so the row unfolds on its own.
   */
  let { activity, active, live = false }: { activity: ReasoningActivityView; active?: boolean; live?: boolean } = $props();
  /** The reader's own toggle; until they make one the row follows `live`. */
  let chosenOpen = $state<boolean | null>(null);
  const open = $derived(chosenOpen ?? live);
  const thinking = $derived(active ?? activity.status === "streaming");
  const preview = $derived(reasoningPreview(activity.text, thinking));
</script>

<Collapsible.Root bind:open={() => open, (next) => { chosenOpen = next; }} class="activity-row reasoning-activity">
  <Collapsible.Trigger class="activity-trigger reasoning-trigger">
    <span class="codicon codicon-lightbulb activity-leading" aria-hidden="true"></span>
    <span class="activity-title" class:shimmer-text={thinking}>{thinking ? "Thinking" : "Reasoning"}</span>
    {#if preview && !open}<span class="reasoning-preview" title={preview}>{preview}</span>{/if}
    {#if thinking}<span class="thinking-pulse"></span>{/if}
    <span class={`codicon codicon-chevron-${open ? "down" : "right"} activity-chevron`} aria-hidden="true"></span>
  </Collapsible.Trigger>
  <Collapsible.Content class="activity-content reasoning-content">
    <div class="reasoning-body" class:reasoning-live={thinking} use:stickToEnd={thinking}>
      <MarkdownContent content={activity.text} />
    </div>
  </Collapsible.Content>
</Collapsible.Root>

<style>
.reasoning-preview::before { content: "·"; margin-right: 6px; }
.reasoning-preview {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  white-space: nowrap;
  color: var(--frost-faint);
  font-size: 12px;
  mask-image: linear-gradient(to right, #000 calc(100% - 40px), transparent);
}
/* Reasoning reads as secondary to the reply. The markdown wrapper sets its own colour and size,
   so it has to be told to inherit them. (The row's `class` goes to a bits-ui element, where a
   selector in this block cannot reach it, so the body div carries the styling.) */
.reasoning-body { color: var(--frost-muted); font-size: 11.5px; }
.reasoning-body :global(.message-content),
.reasoning-body :global(.markdown-body) { color: inherit; font-size: inherit; }
.reasoning-body :global(.markdown-body) { --md-body: var(--frost-muted); }
/* A reasoning still being written shows its newest lines in a fixed window instead of growing the page. */
.reasoning-live { max-height: 180px; overflow-y: auto; overscroll-behavior: contain; }
.reasoning-live::-webkit-scrollbar { width: 9px; }
.reasoning-live::-webkit-scrollbar-thumb {
  background: var(--frost-scrollbar);
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 99px;
}
</style>
