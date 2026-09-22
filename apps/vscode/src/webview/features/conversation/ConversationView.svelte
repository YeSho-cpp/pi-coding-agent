<script lang="ts">
  import type { SessionViewModel } from "$shared/model/sessionViewModel";
  import { onDestroy, onMount } from "svelte";

  import NewUpdatesButton from "./scrolling/NewUpdatesButton.svelte";
  import { INITIAL_SCROLL_FOLLOW_STATE, reduceScrollFollow } from "./scrolling/scrollFollowState";
  import AgentTurn from "./AgentTurn.svelte";
  import BranchPointControl from "./BranchPointControl.svelte";
  import BranchSummaryBlock from "./BranchSummaryBlock.svelte";
  import CompactionBlock from "./CompactionBlock.svelte";
  import CustomBlock from "./CustomBlock.svelte";
  import ConversationFind from "./find/ConversationFind.svelte";
  import { isFindShortcut } from "./find/findInConversation";
  import SessionNotice from "./SessionNotice.svelte";
  import TextSelectionMenu from "./TextSelectionMenu.svelte";

  let { session }: { session: SessionViewModel } = $props();
  let scroller: HTMLDivElement;
  let content: HTMLDivElement;
  let followState = $state({ ...INITIAL_SCROLL_FOLLOW_STATE });
  let findOpen = $state(false);
  let lastConversationContentRevision = 0;
  let lastTurnCount = 0;
  let programmaticScroll = false;
  let resizeObserver: ResizeObserver | null = null;

  const turnCount = $derived(session.conversationItems.filter((item) => item.type === "turn").length);
  const queuedPrompts = $derived([
    ...session.queuedSteers.map((item) => ({ item, delivery: "Steer" as const })),
    ...session.queuedFollowUps.map((item) => ({ item, delivery: "Queue" as const })),
  ]);

  onMount(() => {
    resizeObserver = new ResizeObserver(() => {
      if (followState.mode === "following") scrollToBottom(false);
    });
    resizeObserver.observe(content);
    requestAnimationFrame(() => scrollToBottom(false));
  });

  onDestroy(() => resizeObserver?.disconnect());

  /**
   * Find is owned by the conversation surface, the way Copilot Chat owns it: the keystroke only
   * reaches here while focus is inside this webview, which is also the only time the reader is
   * looking at the conversation rather than the editor.
   *
   * The listener runs in the **capture phase** on purpose. VS Code's own webview shell listens in
   * the bubble phase and forwards every keydown to the workbench as `did-keydown`, where
   * `actions.find` dispatches with no when-clause whenever an editor is open — so without
   * stopping the event here, one Ctrl/Cmd+F would open this widget *and* the editor's. Capture
   * runs first regardless of the shell having registered earlier; stopImmediatePropagation then
   * keeps the shell from ever seeing the key.
   */
  $effect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isFindShortcut(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        findOpen = true;
        return;
      }
      if (event.key === "Escape" && findOpen && !event.defaultPrevented) {
        event.preventDefault();
        findOpen = false;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  $effect(() => {
    const contentRevision = session.conversationContentRevision;
    if (!scroller || contentRevision === lastConversationContentRevision) return;
    const isNewTurn = turnCount > lastTurnCount;
    lastConversationContentRevision = contentRevision;
    lastTurnCount = turnCount;
    if (isNewTurn) {
      followState = reduceScrollFollow(followState, { type: "contentUpdate", newTurn: true });
      requestAnimationFrame(() => scrollToBottom(false));
    } else {
      followState = reduceScrollFollow(followState, { type: "contentUpdate", newTurn: false });
      if (followState.mode === "following") requestAnimationFrame(() => scrollToBottom(false));
    }
  });

  function handleScroll(): void {
    if (!scroller) return;
    followState = reduceScrollFollow(followState, {
      type: "userScroll",
      distanceFromBottom: distanceFromBottom(),
      threshold: 64,
      programmatic: programmaticScroll,
    });
  }

  function resumeFollowing(): void {
    followState = reduceScrollFollow(followState, { type: "resume" });
    scrollToBottom(true);
  }

  function scrollToBottom(smooth: boolean): void {
    if (!scroller) return;
    programmaticScroll = true;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    window.setTimeout(() => { programmaticScroll = false; }, smooth ? 220 : 0);
  }

  function distanceFromBottom(): number {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  }
</script>

<div class="conversation-frame">
  <div class="conversation" bind:this={scroller} onscroll={handleScroll}>
    <div class="conversation-inner" bind:this={content}>
      {#if session.conversationItems.length === 0}
        <div class="conversation-empty conversation-empty-plain" role="status">
          {#if session.historyStatus === "loading" || session.historyStatus === "queued" || session.status === "starting" || session.status === "queued"}
            <p class="empty-title">正在加载会话…</p>
            <p class="empty-hint">从磁盘恢复 Pi 会话历史。</p>
          {:else}
            <p class="empty-title">开始对话</p>
            <p class="empty-hint">让 Pi 检查代码、修改文件、执行命令，或解释当前项目。</p>
          {/if}
        </div>
      {:else}
        {#each session.conversationItems as item (item.id)}
          {#if item.type === "turn"}
            <AgentTurn turn={item} {session} />
          {:else if item.type === "branchControl"}
            <BranchPointControl control={item} {session} />
          {:else if item.type === "compaction"}
            <CompactionBlock compaction={item} />
          {:else if item.type === "branchSummary"}
            <BranchSummaryBlock summary={item} />
          {:else if item.type === "customMessage"}
            <CustomBlock message={item} />
          {:else}
            <SessionNotice notice={item} />
          {/if}
        {/each}
      {/if}
      {#if session.isCompacting || session.isNavigatingTree}
        <div class="session-progress" role="status" aria-live="polite">
          <span class={`codicon ${session.isCompacting ? "codicon-fold" : "codicon-git-branch"}`} aria-hidden="true"></span>
          <span class="session-progress-label">
            {session.isCompacting ? "Compacting context" : session.isSummarizingTree ? "Summarizing branch" : "Switching branch"}
          </span>
          <span class="thinking-pulse" aria-hidden="true"></span>
        </div>
      {/if}
      {#if queuedPrompts.length}
        <div class="queued-follow-ups" aria-label="Queued prompts">
          {#each queuedPrompts as queued (queued.item.id)}
            <article class="message message-user message-queued">
              <div class="user-bubble queued-bubble">
                {#if queued.item.text}<div class="queued-text">{queued.item.text}</div>{/if}
                {#if queued.item.images.length}
                  <div class="queued-images">{queued.item.images.length} image{queued.item.images.length === 1 ? "" : "s"}</div>
                {/if}
                <div class:queued-badge-steer={queued.delivery === "Steer"} class="queued-badge">
                  <span class="thinking-pulse" aria-hidden="true"></span>
                  <span>{queued.delivery}</span>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
      <div class="conversation-tail" aria-hidden="true"></div>
    </div>
  </div>
  {#if findOpen}
    <ConversationFind container={content} revision={session.conversationContentRevision} onclose={() => (findOpen = false)} />
  {/if}
  {#if followState.mode === "paused"}<NewUpdatesButton count={followState.unseenUpdates} onclick={resumeFollowing} />{/if}
</div>
<TextSelectionMenu />

<style>
.conversation-frame { position: relative; min-height: 0; }
.conversation-inner { width: 100%; max-width: var(--content-max-width); min-height: 100%; margin: 0 auto; padding: 18px 14px 28px; }
.conversation {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-color: var(--frost-scrollbar) transparent;
}
/* OpenChamber-like edge fade when content overflows (scroll cue). */
.conversation-frame::before,
.conversation-frame::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 18px;
  pointer-events: none;
  z-index: 2;
  opacity: 0;
  transition: opacity var(--motion-fast, 120ms);
}
.conversation-frame::before {
  top: 0;
  background: linear-gradient(to bottom, var(--frost-bg), transparent);
}
.conversation-frame::after {
  bottom: 0;
  background: linear-gradient(to top, var(--frost-bg), transparent);
}
.conversation-frame:has(.conversation:not(:first-child:last-child))::before,
.conversation-frame:hover::after { opacity: 0.85; }
.conversation-tail { height: 8px; }
.conversation-empty {
  min-height: min(430px, 65vh);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--frost-muted);
  padding: 30px 12px;
}
.conversation-empty :global(h2) { margin: 8px 0 6px; color: var(--frost-text); font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
.conversation-empty :global(p) { max-width: 360px; margin: 0; font-size: 12px; line-height: 1.55; }
.empty-orbit {
  color: var(--frost-accent);
  opacity: 0.16;
  line-height: 0;
}
.empty-brand {
  margin-top: 6px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 600;
  color: color-mix(in srgb, var(--frost-accent) 75%, var(--frost-muted));
}
.conversation-empty-plain {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 180px;
  text-align: center;
  color: var(--frost-muted);
}
.conversation-empty-plain .empty-title {
  margin: 0;
  color: var(--frost-text);
  font-size: 13px;
  font-weight: 600;
}
.conversation-empty-plain .empty-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--frost-muted);
}
.conversation-inner { padding-top: 14px; padding-bottom: 34px; }
.queued-follow-ups { display: grid; gap: 8px; margin: 4px 0 10px; }
.message-queued { opacity: 0.88; }
.queued-bubble {
  position: relative;
  border-style: dashed;
  background: color-mix(in srgb, var(--frost-surface) 70%, transparent);
  box-shadow: none;
}
.queued-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.45; }
.queued-images { margin-top: 4px; color: var(--frost-muted); font-size: 10.5px; }
.queued-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  color: var(--frost-muted);
  font-size: 10px;
  font-weight: 500;
}
.queued-badge-steer { color: var(--frost-link); }
.session-progress {
  margin: 5px 0 12px;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border: 1px solid var(--frost-border-soft);
  border-radius: 7px;
  background: color-mix(in srgb, var(--frost-surface) 56%, transparent);
  color: var(--frost-muted);
  font-size: 11px;
}
.session-progress > :global(.codicon) { color: var(--frost-link); font-size: 13px; }
.session-progress-label { color: var(--frost-text); font-weight: 600; }
.session-progress :global(.thinking-pulse) { margin-left: 1px; }

@media (max-width: 330px) {
  .conversation-inner { padding-left: 8px; padding-right: 8px; }
}

@media (max-width: 560px) {
  .conversation-inner { padding-left: 11px; padding-right: 11px; }
  .conversation-empty { min-height: min(380px, 58vh); padding-left: 8px; padding-right: 8px; }
  .conversation-empty :global(h2) { max-width: 100%; font-size: 16px; }
  .conversation-empty :global(p) { max-width: min(330px, 100%); }
}
</style>
