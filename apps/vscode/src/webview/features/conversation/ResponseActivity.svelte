<script lang="ts">
  import type { ResponseActivityView } from "$shared/model/conversationModel";
  import type { SessionViewModel } from "$shared/model/sessionViewModel";

  import { beginAnnotationReview } from "../annotation-review/annotationReviewStore.svelte";
  import ImageGallery from "./ImageGallery.svelte";
  import MarkdownContent from "./MarkdownContent.svelte";
  import { copyMessageText, rawMessageText } from "./copyMessageClient";
  import { formatMessageTimestamp } from "./messageTimestamp";
  import { requestBranchHere } from "./sessionTreeClient";
  import { saveMessageElementAsImage } from "./saveAsImage";

  let {
    activity,
    sessionId,
    session,
    entryId,
  }: {
    activity: ResponseActivityView;
    sessionId: string;
    session?: SessionViewModel;
    entryId?: string | undefined;
  } = $props();
  let rootEl = $state<HTMLElement | null>(null);
  const copyText = $derived(rawMessageText(activity.blocks));
  const completedAtLabel = $derived(formatMessageTimestamp(activity.timestamp));
  const canRevert = $derived(Boolean(session && entryId && session.sessionTreeAvailable));
  const unavailable = $derived(
    session
      && (session.status !== "ready"
        || session.isStreaming
        || session.isCompacting
        || session.isForking
        || session.isNavigatingTree
        || session.historyStatus !== "loaded"),
  );
  let saving = $state(false);

  async function saveImage(): Promise<void> {
    if (saving || !rootEl) return;
    saving = true;
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      await saveMessageElementAsImage(rootEl, { fileName: `frost-ui-answer-${stamp}` });
    } catch (error) {
      console.error("[SaveAsImage] failed:", error);
    } finally {
      saving = false;
    }
  }
</script>

<div class="response-activity" class:response-error={activity.status === "error"} bind:this={rootEl}>
  <div class="response-snapshot" data-message-snapshot>
  {#each activity.blocks as block, index (index)}
    {#if block.type === "text" && block.text}<MarkdownContent content={block.text} />{/if}
    {#if block.type === "images"}<ImageGallery images={block.images} />{/if}
    {#if block.type === "error"}<div class="inline-error">{block.text}</div>{/if}
  {/each}
  </div>
  {#if activity.status === "aborted"}<div class="message-footnote">Stopped by user</div>{/if}
  {#if copyText && activity.status !== "streaming"}
    <div class="message-actions response-actions">
      <button type="button" aria-label="Copy assistant response" title="Copy raw response text" onclick={() => copyMessageText(activity.blocks)}>
        <span class="codicon codicon-copy" aria-hidden="true"></span>
        <span>Copy</span>
      </button>
      <button
        type="button"
        aria-label="Save response as image"
        title="Save this answer as PNG"
        disabled={saving}
        onclick={() => { void saveImage(); }}
      >
        <span class="codicon codicon-device-camera" aria-hidden="true"></span>
        <span>{saving ? "Saving…" : "保存为图片"}</span>
      </button>
      {#if session && entryId}
        <button
          type="button"
          aria-label="Revert conversation from here"
          title={canRevert
            ? "从此处回退：在同一会话中从该提问继续（session tree）"
            : "Session tree navigation is unavailable. Update Pi, restart the session."}
          disabled={unavailable || !canRevert}
          onclick={() => requestBranchHere(session, {
            id: sessionId,
            sourceEntryId: entryId,
            blocks: activity.blocks,
            role: "assistant",
            status: "complete",
            timestamp: activity.timestamp,
          })}
        >
          <span class="codicon codicon-history" aria-hidden="true"></span>
          <span>从此处回退</span>
        </button>
      {/if}
      <button
        type="button"
        aria-label="Annotate assistant response"
        title="Annotate this response"
        onclick={() => beginAnnotationReview(sessionId, copyText)}
      >
        <span class="codicon codicon-comment-discussion" aria-hidden="true"></span>
        <span>Annotate</span>
      </button>
      {#if completedAtLabel}
        <time
          class="action-row-timestamp"
          datetime={new Date(activity.timestamp).toISOString()}
          title={new Date(activity.timestamp).toLocaleString()}
        >{completedAtLabel}</time>
      {/if}
    </div>
  {/if}
</div>

<style>
.response-activity:hover > .response-actions,
.response-activity:focus-within > .response-actions,
.response-activity > .response-actions { opacity: 1; }
.message-footnote { margin-top: 6px; color: var(--frost-muted); font-size: 11px; font-style: italic; }
.response-activity { min-width: 0; padding: 4px 2px 7px; }
/* Sibling chrome crosses component instances; keep unscoped. */
:global(.response-activity + .response-activity) { padding-top: 0; }
.response-actions { justify-content: flex-start; }
/* Timestamp trails the hover row; the shared chip style lives in styles/tokens.css. */
.response-actions .action-row-timestamp { margin-left: auto; }
.response-error { color: var(--frost-error); }
</style>
