<script lang="ts">
  import type { RpcModel, StreamingBehavior } from "@frostime/pi-rpc";
  import type { SessionViewModel } from "$shared/model/sessionViewModel";

  import { postToHost } from "../../bridge/vscodeBridge";
  import { composerDrafts, getDraft, type DraftImage, type SessionDraft } from "../../features/composer/composerDraftStore.svelte";
  import { clearDraft, clearDraftForSubmission, setDraft, setDraftText, updateDraft } from "./composerDraftSync";
  import { promptSubmissionResult } from "../../features/composer/promptSubmissionStore.svelte";
  import { composerStreamingBehaviors, setComposerStreamingBehavior } from "../../features/composer/composerStreamingBehaviorStore.svelte";
  import { composerFocusTick, showToast } from "../../state/sessionViewStore.svelte";
  import { createId } from "../../utils/createId";
  import { composerEditorPrefill } from "./editorCommand";
  import { withFrostUiCommands } from "./frostuiCommands";
  import ModelPicker from "../models/ModelPicker.svelte";
  import ThinkingLevelPicker from "../models/ThinkingLevelPicker.svelte";
  import ContextUsageRing from "../usage/ContextUsageRing.svelte";

  import AttachmentStrip from "./AttachmentStrip.svelte";
  import AgentPermissionBar from "./AgentPermissionBar.svelte";
  import ContextChipStrip from "./ContextChipStrip.svelte";
  import EditorContextChip from "./EditorContextChip.svelte";
  import {
    editorChipPromptText,
    editorChipAttached,
    editorChipDismissed,
    editorContextHint,
    deactivateEditorChip,
    dismissEditorChip,
  } from "./editorContextHintStore.svelte";
  import {
    clearContextChips,
    contextAttachChips,
  } from "./contextAttachStore.svelte";
  import {
    chipsForComposer,
    chipsToPromptPrefix,
    removeContextMention,
    stripContextMentions,
  } from "./contextMention";
  import PromptEditor from "./PromptEditor.svelte";
  import { pushPromptHistory, resetPromptHistoryNav } from "./promptHistoryStore";
  import StreamingSendButton from "./StreamingSendButton.svelte";

  let {
    session,
    surfaceKind,
    draftAuthority,
  }: {
    session: SessionViewModel;
    surfaceKind: "sidebar" | "panel";
    draftAuthority: "webview" | "host";
  } = $props();
  let editor: PromptEditor;
  let pendingRequestId = $state<string | null>(null);
  let pendingSubmittedDraft = $state<SessionDraft | null>(null);
  let pendingClearedRevision: number | null = null;
  let expanded = $state(false);
  let expandedSessionId: string | null = null;
  let attachMenuOpen = $state(false);

  const draft = $derived($composerDrafts[session.id] ?? { revision: 0, text: "", images: [] });
  const contextChips = $derived(chipsForComposer($contextAttachChips, session.id));
  const commands = $derived(withFrostUiCommands(session.commands, surfaceKind === "sidebar"));
  const streamingBehavior = $derived($composerStreamingBehaviors[session.id] ?? session.composerStreamingBehavior);
  const unavailable = $derived(
    session.status === "queued" || session.status === "starting" || session.status === "stopping" || session.status === "failed"
    || session.historyStatus === "queued" || session.historyStatus === "loading" || session.isCompacting || session.isForking || session.isNavigatingTree,
  );
  const editorChipLive = $derived(
    Boolean($editorContextHint.available && $editorContextHint.path) && !$editorChipDismissed,
  );
  const editorChipActive = $derived(editorChipLive && $editorChipAttached);
  const hasAnyChip = $derived(editorChipLive || contextChips.length > 0);
  const canSend = $derived(
    (
      draft.text.trim().length > 0
      || draft.images.length > 0
      || contextChips.length > 0
      || editorChipActive
    ) && !unavailable && !pendingRequestId,
  );
  const composerPlaceholder = $derived(() => {
    const t = draft.text.trimStart();
    if (session.isNavigatingTree) return "Switching conversation branch…";
    if (session.isStreaming || session.queuedSteers.length > 0 || session.queuedFollowUps.length > 0) {
      return "Steer or queue a message…";
    }
    if (t.startsWith("!!") || t === "!") return "输入 shell 命令…（!! 不进入模型上下文）";
    if (t.startsWith("!")) return "输入 shell 命令…（! 会进入模型上下文）";
    if (t.startsWith("/")) return "输入命令或技能…";
    if (t.startsWith("@")) return "输入文件路径…";
    if (contextChips.length) return "Ask about the attached context…";
    return "@ 文件/智能体 · / 命令与技能 · ! shell · !! shell(无上下文)";
  });

  const shellMode = $derived(() => {
    const t = draft.text.trimStart();
    return t.startsWith("!") ? (t.startsWith("!!") ? "!!" as const : "!" as const) : null;
  });

  const supportsImages = $derived(modelSupportsImages(session.model));

  export function focusAtEnd(): void {
    requestAnimationFrame(() => editor?.focusAtEnd());
  }

  $effect(() => {
    const currentSessionId = session.id;
    if (expandedSessionId === null) {
      expandedSessionId = currentSessionId;
      return;
    }
    if (currentSessionId === expandedSessionId) return;
    expandedSessionId = currentSessionId;
    expanded = false;
  });

  $effect(() => {
    $composerFocusTick;
    requestAnimationFrame(() => editor?.focus());
  });

  $effect(() => {
    const result = $promptSubmissionResult;
    if (!result || !pendingRequestId) return;
    if (result.requestId !== pendingRequestId) return;
    const submitted = pendingSubmittedDraft;
    const clearedRevision = pendingClearedRevision;
    pendingRequestId = null;
    pendingSubmittedDraft = null;
    pendingClearedRevision = null;
    if (result.ok) {
      requestAnimationFrame(() => editor?.focusAtEnd());
      return;
    }
    if (result.error) showToast("error", result.error);
    if (surfaceKind === "panel" || !submitted || clearedRevision === null) return;
    const current = getDraft(session.id);
    if (current.revision !== clearedRevision || current.text || current.images.length) return;
    setDraft(session.id, "webview", submitted);
  });

  $effect(() => {
    const id = pendingRequestId;
    if (!id) return;
    const timer = window.setTimeout(() => {
      if (pendingRequestId !== id) return;
      console.warn("[Pi] Unlocking composer: promptResult timed out", id);
      pendingRequestId = null;
      pendingSubmittedDraft = null;
      pendingClearedRevision = null;
    }, 30_000);
    return () => window.clearTimeout(timer);
  });

  $effect(() => {
    const streaming = session.isStreaming;
    if (streaming || !pendingRequestId) return;
    const timer = window.setTimeout(() => {
      if (!pendingRequestId || session.isStreaming) return;
      pendingRequestId = null;
    }, 500);
    return () => window.clearTimeout(timer);
  });

  $effect(() => {
    const needsEsc = expanded || attachMenuOpen || contextChips.length > 0 || editorChipActive;
    if (!needsEsc) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (attachMenuOpen) {
        event.preventDefault();
        attachMenuOpen = false;
        return;
      }
      // Editor chip first: Esc → inactive ghost (× / editor Esc share this path)
      if (editorChipActive) {
        event.preventDefault();
        deactivateEditorChip();
        postToHost({ type: "setEditorChipAttached", attached: false });
        return;
      }
      if (contextChips.length > 0) {
        event.preventDefault();
        clearContextChips(session.id);
        return;
      }
      if (expanded) {
        event.preventDefault();
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function setText(text: string): void {
    setDraftText(session.id, draftAuthority, text);
  }

  /** Clear = click every chip ×: drop manual chips + hide editor chip until next open/selection. */
  function clearAllContextChips(): void {
    const chips = contextChips;
    const nextText = stripContextMentions(session.id, chips);
    clearContextChips(session.id);
    if (nextText !== draft.text) setDraftText(session.id, draftAuthority, nextText);
    dismissEditorChip();
    postToHost({ type: "setEditorChipAttached", attached: false });
  }

  function setExpanded(next: boolean): void {
    expanded = next;
    requestAnimationFrame(() => editor?.focus());
  }

  function submit(requestedStreamingBehavior: StreamingBehavior = streamingBehavior): void {
    if (!canSend) return;
    const submittedBody = draft.text;
    if (submittedBody.trim()) pushPromptHistory(session.id, submittedBody);
    if (draft.images.length === 0 && contextChips.length === 0 && draft.text.trim() === "/resume") {
      if (surfaceKind === "panel") {
        showToast("info", "Open the Pi sidebar to resume a session.");
        return;
      }
      clearDraft(session.id, draftAuthority);
      postToHost({ type: "resumeSession" });
      return;
    }
    const editorPrefill = composerEditorPrefill(draft.text);
    if (editorPrefill !== null && contextChips.length === 0) {
      setText(editorPrefill);
      postToHost({ type: "openComposerEditor", sessionId: session.id, text: editorPrefill });
      return;
    }
    const requestId = createId("prompt");
    // Editor chip (active only) + QuickPick chips → @path prefix; not shown in editor text.
    const editorPrefix = editorChipPromptText($editorContextHint, $editorChipAttached);
    const chipPrefix = [editorPrefix, chipsToPromptPrefix(contextChips)].filter(Boolean).join(" ");
    const body = draft.text.trim();
    const text = chipPrefix
      ? body
        ? `${chipPrefix}\n\n${body}`
        : chipPrefix
      : draft.text;
    pendingRequestId = requestId;
    pendingSubmittedDraft = {
      revision: draft.revision,
      text: draft.text,
      images: draft.images.map((image) => ({ ...image })),
    };
    const images = draft.images.map(({ id, name, mimeType, data, size }) => ({ id, name, mimeType, data, size }));
    pendingClearedRevision = clearDraftForSubmission(session.id);
    clearContextChips(session.id);
    resetPromptHistoryNav(session.id);
    postToHost({
      type: "sendPrompt",
      requestId,
      sessionId: session.id,
      text,
      images,
      draftRevision: draft.revision,
      streamingBehavior: requestedStreamingBehavior,
    });
  }

  async function handlePastedImages(files: File[]): Promise<void> {
    const accepted: DraftImage[] = [];
    for (const file of files) {
      if (!isSupportedMime(file.type)) {
        showToast("warning", `Unsupported image type: ${file.type}`);
        continue;
      }
      if (file.size > session.attachmentLimits.maxImageBytes) {
        showToast("warning", `${file.name || "Pasted image"} is larger than ${formatBytes(session.attachmentLimits.maxImageBytes)}.`);
        continue;
      }
      const dataUrl = await readDataUrl(file);
      accepted.push({
        id: createId("image"),
        name: file.name || `pasted-image-${Date.now()}.${extensionForMime(file.type)}`,
        mimeType: file.type as DraftImage["mimeType"],
        data: dataUrl.slice(dataUrl.indexOf(",") + 1),
        dataUrl,
        size: file.size,
      });
    }
    if (!accepted.length) return;
    updateDraft(session.id, draftAuthority, (current) => {
      const images = [...current.images, ...accepted].slice(0, session.attachmentLimits.maxImages);
      if (current.images.length + accepted.length > session.attachmentLimits.maxImages) {
        showToast("warning", `A prompt can include at most ${session.attachmentLimits.maxImages} images.`);
      }
      return { ...current, images };
    });
  }
</script>

<div class="composer-shell" class:composer-expanded={expanded}>
  <AttachmentStrip images={draft.images} onremove={(id) => updateDraft(session.id, draftAuthority, (current) => ({ ...current, images: current.images.filter((image) => image.id !== id) }))} />
  {#if draft.images.length && session.model && !supportsImages}
    <div class="composer-warning"><span class="codicon codicon-warning"></span> The selected model may not accept images.</div>
  {/if}
  <div class="composer-box" class:composer-running={session.isStreaming}>
    <button
      class="composer-expand-button"
      type="button"
      aria-label={expanded ? "Minimize composer" : "Expand composer"}
      aria-pressed={expanded}
      title={expanded ? "Minimize composer (Esc)" : "Expand composer"}
      onclick={() => setExpanded(!expanded)}
    >
      <span class={`codicon codicon-screen-${expanded ? "normal" : "full"}`}></span>
    </button>
    <!-- Editor context chip + attached chips; Clear empties the whole row -->
    <div class="composer-chip-row" class:empty={!hasAnyChip}>
      <EditorContextChip />
      <ContextChipStrip
        items={contextChips}
        onremove={(id) => removeContextMention(session.id, id)}
      />
      {#if hasAnyChip}
        <button
          type="button"
          class="composer-chip-clear"
          title="清除全部上下文 chip（等同逐个点 ×）"
          onclick={clearAllContextChips}
        >
          Clear
        </button>
      {/if}
    </div>
    <PromptEditor
      bind:this={editor}
      sessionId={session.id}
      value={draft.text}
      {commands}
      placeholder={composerPlaceholder()}
      onchange={setText}
      currentStreamingBehavior={streamingBehavior}
      onsubmit={submit}
      onpasteimages={handlePastedImages}
    />
    {#if shellMode()}
      <div class="composer-mode-bar" role="status">
        <span class="codicon codicon-terminal" aria-hidden="true"></span>
        <span>shell{shellMode() === "!!" ? " · 不进入上下文" : " · 进入上下文"}</span>
      </div>
    {/if}
    <div class="composer-toolbar">
      <div class="composer-toolbar-left">
        <!-- + opens QuickPick directly (no nested menu for selection/file). -->
        <button
          class="context-attach-trigger"
          type="button"
          aria-label="Attach files or folders"
          title="Attach files/folders (@路径)"
          disabled={unavailable}
          onclick={() => postToHost({ type: "pickContext", mode: "filesAndFolders" })}
        >
          <span class="codicon codicon-add"></span>
        </button>
        <ModelPicker
          sessionId={session.id}
          model={session.model}
          models={session.availableModels}
          scopedModelIds={session.scopedModelIds}
          disabled={unavailable}
        />
        <ThinkingLevelPicker sessionId={session.id} model={session.model} level={session.thinkingLevel} disabled={unavailable} />
      </div>
      <div class="composer-toolbar-right">
        <span class="send-hint">Enter</span>
        {#if session.isForking}
          <button class="send-button stop-button" type="button" aria-label="Cancel Fork" title="Cancel Fork and restore the original session" onclick={() => postToHost({ type: "cancelFork", sessionId: session.id })}>
            <span class="codicon codicon-debug-stop"></span>
          </button>
        {:else if session.isStreaming}
          {#if canSend}
            <StreamingSendButton
              selected={streamingBehavior}
              onselect={(behavior) => setComposerStreamingBehavior(session.id, behavior)}
              onsubmit={submit}
            />
          {/if}
          <button class="send-button stop-button" type="button" aria-label="Stop Pi" title="Stop current run" onclick={() => postToHost({ type: "abort", sessionId: session.id })}>
            <span class="codicon codicon-debug-stop"></span>
          </button>
        {:else}
          <button class="send-button" type="button" aria-label="Send to Pi" title="Send (Enter)" disabled={!canSend} onclick={() => submit()}>
            <span class="codicon codicon-arrow-up"></span>
          </button>
        {/if}
      </div>
    </div>
  </div>
  <div class="composer-status-footer">
    <AgentPermissionBar {session} />
    <div class="composer-status-footer-right">
      <ContextUsageRing {session} />
    </div>
  </div>
</div>

<script lang="ts" module>
  function modelSupportsImages(model: RpcModel | null): boolean {
    return Boolean(model && (model.supportsImages === true || (Array.isArray(model.input) && model.input.includes("image"))));
  }

  function isSupportedMime(mime: string): boolean {
    return ["image/png", "image/jpeg", "image/webp"].includes(mime);
  }

  function formatBytes(size: number): string {
    const megabytes = size / 1024 / 1024;
    return `${Number.isInteger(megabytes) ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
  }

  function extensionForMime(mime: string): string {
    return mime === "image/jpeg" ? "jpg" : mime.split("/")[1] ?? "png";
  }

  function readDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read pasted image"));
      reader.readAsDataURL(file);
    });
  }
</script>

<style>
  .composer-hint-bar,
  .composer-mode-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 4px 10px 6px;
    color: var(--frost-faint);
    font-size: 10px;
  }
  .composer-mode-bar {
    color: var(--frost-accent);
  }
  :global(.cm-prompt-shell-bang) {
    color: var(--frost-accent);
    font-weight: 600;
  }
  :global(.cm-prompt-shell-bang-quiet) {
    color: var(--frost-warning);
    font-weight: 700;
  }
</style>
