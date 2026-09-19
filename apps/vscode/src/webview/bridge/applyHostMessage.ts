import { BRIDGE_VERSION } from "$shared/bridge/bridgeVersion";
import type { CollectionDelta, HostToWebviewMessage } from "$shared/bridge/hostToWebview";
import type { ChatTypographyView } from "$shared/model/chatTypography";
import type { SessionViewModel } from "$shared/model/sessionViewModel";

import { applyComposerSeed } from "../features/composer/composerSeedClient";
import { applyHostDraft, insertDraftText, setDraftText } from "../features/composer/composerDraftSync";
import { addContextChips } from "../features/composer/contextAttachStore.svelte";
import { applyContextAsFileMention } from "../features/composer/contextMention";
import { applyEditorContextHint } from "../features/composer/editorContextHintStore.svelte";
import { deliverWorkspaceFileSuggestions } from "../features/composer/fileSuggestionClient";
import { promptSubmissionResult } from "../features/composer/promptSubmissionStore.svelte";
import { resolveForkResult } from "../features/conversation/forkMessageClient";
import { deliverMarkdownImageResult } from "../features/conversation/markdown/markdownImageClient";
import { composerFocusTick, presentationStore, showToast } from "../state/sessionViewStore.svelte";
import { get } from "svelte/store";

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
      presentationStore.update((current) => {
        const incoming = message.presentation;
        const incomingBaseId = incoming.displayedSession?.base.id;
        const existing = current.displayedSession?.id === incomingBaseId ? current.displayedSession : null;
        displayedSession = incoming.displayedSession ? {
          ...incoming.displayedSession.base,
          conversationItems: mergeCollection(
            existing?.conversationItems ?? [],
            incoming.displayedSession.conversationItems,
          ),
        } : null;
        return {
          ...incoming,
          catalogSessions: incoming.catalogSessions ?? current.catalogSessions ?? [],
          displayedSession,
        };
      });
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

export function mergeCollection<T extends { id: string }>(current: readonly T[], delta: CollectionDelta<T>): T[] {
  if (delta.mode === "replace") return [...delta.items];
  if (delta.items.length === 0) return [...current];
  const updates = new Map(delta.items.map((item) => [item.id, item]));
  const merged = current.map((item) => updates.get(item.id) ?? item);
  const known = new Set(current.map((item) => item.id));
  for (const item of delta.items) if (!known.has(item.id)) merged.push(item);
  return merged;
}
