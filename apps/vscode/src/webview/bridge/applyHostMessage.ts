import { BRIDGE_VERSION } from "$shared/bridge/bridgeVersion";
import type { CollectionDelta, HostToWebviewMessage, TurnPatch } from "$shared/bridge/hostToWebview";
import type { ChatTypographyView } from "$shared/model/chatTypography";
import type { AgentTurnItemView, AgentTurnView } from "$shared/model/conversationModel";
import type { SessionViewModel } from "$shared/model/sessionViewModel";

import { applyComposerSeed } from "../features/composer/composerSeedClient";
import { deliverHighlightedCode } from "../features/conversation/markdown/highlightClient";
import { deliverFileIcon } from "../features/conversation/markdown/fileIconClient";
import { applyHostDraft, insertDraftText, setDraftText } from "../features/composer/composerDraftSync";
import { addContextChips } from "../features/composer/contextAttachStore.svelte";
import { applyContextAsFileMention } from "../features/composer/contextMention";
import { applyEditorContextHint } from "../features/composer/editorContextHintStore.svelte";
import { deliverWorkspaceFileSuggestions } from "../features/composer/fileSuggestionClient";
import { promptSubmissionResult } from "../features/composer/promptSubmissionStore.svelte";
import { resolveForkResult } from "../features/conversation/forkMessageClient";
import { deliverMarkdownImageResult } from "../features/conversation/markdown/markdownImageClient";
import { composerFocusTick, mcpServers, presentationStore, showToast } from "../state/sessionViewStore.svelte";
import { get } from "svelte/store";

import { postToHost } from "./vscodeBridge";

export function applyHostMessage(message: HostToWebviewMessage): void {
  if (message.bridgeVersion !== BRIDGE_VERSION) {
    showToast("error", "Pi Coding Agent and extension host are incompatible. Reload the window.");
    return;
  }
  switch (message.type) {
    case "setChatTypography":
      applyChatTypography(message.typography);
      break;
    case "snapshot":
      presentationStore.set({
        ...message.presentation,
        catalogSessions: message.presentation.catalogSessions ?? [],
      });
      if (message.presentation.displayedSession && message.draft) {
        applyHostDraft(message.presentation.displayedSession.id, message.draft);
      }
      applyComposerSeed(message.presentation.displayedSession, message.presentation.composerDraftAuthority);
      break;
    case "presentationDelta": {
      let displayedSession: SessionViewModel | null = null;
      let unresolvedPatch = false;
      presentationStore.update((current) => {
        const incoming = message.presentation;
        const incomingBaseId = incoming.displayedSession?.base.id;
        const existing = current.displayedSession?.id === incomingBaseId ? current.displayedSession : null;
        displayedSession = incoming.displayedSession ? {
          ...incoming.displayedSession.base,
          conversationItems: mergeCollection(
            existing?.conversationItems ?? [],
            incoming.displayedSession.conversationItems,
            () => { unresolvedPatch = true; },
          ),
        } : null;
        return {
          ...incoming,
          catalogSessions: incoming.catalogSessions ?? current.catalogSessions ?? [],
          displayedSession,
        };
      });
      if (unresolvedPatch) requestResync();
      applyComposerSeed(displayedSession, message.presentation.composerDraftAuthority);
      break;
    }
    case "draftReplacement":
      applyHostDraft(message.sessionId, message.draft);
      break;
    case "replaceComposerText":
      setDraftText(message.sessionId, "webview", message.text);
      break;
    case "insertPromptText":
      insertDraftText(message.sessionId, "webview", message.text);
      break;
    case "contextAttachPicked": {
      const state = get(presentationStore);
      const sessionId = message.sessionId || state.displayedSession?.id || state.activeSessionId;
      if (!sessionId) break;
      // @file-style: chip in Composer + path token in draft (removable).
      applyContextAsFileMention(sessionId, message.items);
      break;
    }
    case "editorContextHint": {
      const hint: Parameters<typeof applyEditorContextHint>[0] = {
        available: message.available,
        hasSelection: Boolean(message.hasSelection),
      };
      if (message.attached !== undefined) hint.attached = message.attached;
      if (message.path !== undefined) hint.path = message.path;
      if (message.startLine !== undefined) hint.startLine = message.startLine;
      if (message.endLine !== undefined) hint.endLine = message.endLine;
      if (message.label !== undefined) hint.label = message.label;
      if (message.iconDataUri !== undefined) hint.iconDataUri = message.iconDataUri;
      applyEditorContextHint(hint);
      break;
    }
    case "focusComposer":
      composerFocusTick.update((value) => value + 1);
      break;
    case "promptResult":
      promptSubmissionResult.set(message);
      if (!message.ok && message.error) showToast("error", message.error);
      break;
    case "markdownImageResult":
      deliverMarkdownImageResult(message.requestId, message.sessionId, message.result);
      break;
    case "forkResult":
      resolveForkResult(message);
      break;
    case "workspaceFileSuggestions":
      deliverWorkspaceFileSuggestions(message.requestId, message.items, message.error, message.specials);
      break;
    case "toast":
      showToast(message.level, message.message);
      break;
    case "welcomeResources":
      welcomeResources.set(message);
      break;
    case "mcpServers": {
      // A read is answered asynchronously; a reply for a session the reader has already left
      // must not overwrite the list they are looking at.
      const displayed = get(presentationStore).displayedSession?.id;
      if (displayed && message.sessionId !== displayed) break;
      mcpServers.set(message);
      break;
    }
    case "highlightCodeResult":
      deliverHighlightedCode(message.requestId, message.html);
      break;
    case "fileIconResult":
      deliverFileIcon(message.requestId, message.dataUri);
      break;
  }
}

function applyChatTypography(typography: ChatTypographyView): void {
  const style = document.documentElement.style;
  setOptionalCssProperty(style, "--frostui-chat-message-font-family", typography.message.fontFamily);
  style.setProperty("--frostui-chat-message-font-size", `${typography.message.fontSize}px`);
  setOptionalCssProperty(style, "--frostui-chat-composer-font-family", typography.composer.fontFamily);
  style.setProperty("--frostui-chat-composer-font-size", `${typography.composer.fontSize}px`);
}

function setOptionalCssProperty(style: CSSStyleDeclaration, name: string, value: string | undefined): void {
  if (value) style.setProperty(name, value);
  else style.removeProperty(name);
}

/**
 * `onUnresolvedPatch` fires when a turn patch refers to a turn or item this Webview does not
 * hold, which means the Host's picture of the Webview has drifted and a snapshot is needed.
 */
export function mergeCollection<T extends { id: string }>(
  current: readonly T[],
  delta: CollectionDelta<T>,
  onUnresolvedPatch?: () => void,
): T[] {
  if (delta.mode === "replace") return [...delta.items];
  const patches = delta.turnPatches ?? [];
  if (delta.items.length === 0 && patches.length === 0) return [...current];

  const patchById = new Map(patches.map((patch) => [patch.id, patch]));
  const updates = new Map(delta.items.map((item) => [item.id, item]));
  const merged = current.map((item) => {
    const replacement = updates.get(item.id);
    if (replacement) return replacement;
    const patch = patchById.get(item.id);
    if (!patch) return item;
    patchById.delete(item.id);
    return applyTurnPatch(item, patch, onUnresolvedPatch);
  });
  if (patchById.size > 0) onUnresolvedPatch?.();
  const known = new Set(current.map((item) => item.id));
  for (const item of delta.items) if (!known.has(item.id)) merged.push(item);
  return merged;
}

function applyTurnPatch<T extends { id: string }>(item: T, patch: TurnPatch, onUnresolved: (() => void) | undefined): T {
  const turn = item as unknown as AgentTurnView;
  if (turn.type !== "turn") {
    onUnresolved?.();
    return item;
  }

  const byId = new Map<string, AgentTurnItemView>(turn.items.map((entry) => [entry.id, entry]));
  const appended: string[] = [];
  for (const entry of patch.items) {
    if (!byId.has(entry.id)) appended.push(entry.id);
    byId.set(entry.id, entry);
  }
  const order = patch.order ?? [...turn.items.map((entry) => entry.id), ...appended];
  const items: AgentTurnItemView[] = [];
  for (const id of order) {
    const entry = byId.get(id);
    if (entry) items.push(entry);
    else onUnresolved?.();
  }
  return { ...turn, ...patch.fields, items } as unknown as T;
}

let lastResyncAt = 0;

/** Asks the Host for a fresh snapshot, at most once a second. */
function requestResync(): void {
  const now = Date.now();
  if (now - lastResyncAt < 1_000) return;
  lastResyncAt = now;
  postToHost({ type: "ready" });
}
