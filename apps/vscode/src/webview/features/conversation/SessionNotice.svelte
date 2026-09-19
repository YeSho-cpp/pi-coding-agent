<script lang="ts">
  import type { SessionNoticeView } from "$shared/model/conversationModel";
  import { postToHost } from "../../bridge/vscodeBridge";
  import MarkdownContent from "./MarkdownContent.svelte";

  let { notice }: { notice: SessionNoticeView } = $props();
  let copied = $state(false);

  function copyNotice(): void {
    postToHost({ type: "copyText", text: notice.text });
    copied = true;
    window.setTimeout(() => { copied = false; }, 1200);
  }
</script>

<div class={`session-notice session-notice-${notice.level}`}>
  <span class={`codicon codicon-${notice.level}`}></span>
  <div class="session-notice-body">
    <MarkdownContent content={notice.text} />
  </div>
  <button type="button" class="session-notice-copy" title="Copy notice" aria-label="Copy notice text" onclick={copyNotice}>
    <span class="codicon codicon-copy" aria-hidden="true"></span>
    <span class="session-notice-copy-label">{copied ? "Copied" : "Copy"}</span>
  </button>
</div>

<style>
.session-notice {
  margin: 3px 0 10px;
  display: grid;
  grid-template-columns: 15px minmax(0,1fr) auto;
  gap: 7px;
  align-items: start;
  color: var(--frost-muted);
  font-size: 10.5px;
  user-select: text;
}
.session-notice-body { min-width: 0; user-select: text; }
.session-notice > :global(.codicon) { padding-top: 3px; color: var(--frost-link); }
.session-notice-warning { color: var(--frost-warning); }
.session-notice-warning > :global(.codicon) { color: var(--frost-warning); }
.session-notice-error { color: var(--frost-error); }
.session-notice-error > :global(.codicon) { color: var(--frost-error); }
.session-notice :global(.markdown-body p) { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.session-notice-copy {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--frost-faint);
  font-size: 9.5px;
  cursor: pointer;
  opacity: 0.85;
}
.session-notice-copy:hover { color: var(--frost-text); background: var(--frost-hover); }
.session-notice-copy-label { display: none; }
.session-notice:hover .session-notice-copy-label { display: inline; }
</style>
