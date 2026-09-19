import type { ContextAttachItemView } from "$shared/model/contextAttachModel";

import { get } from "svelte/store";

import { getDraft } from "./composerDraftStore.svelte";
import { setDraftText } from "./composerDraftSync";
import { addContextChips, contextAttachChips, removeContextChip } from "./contextAttachStore.svelte";
import { showToast } from "../../state/sessionViewStore.svelte";

/**
 * @file attach: chips only in Composer UI (no path text in the editor).
 * Send path still injects insertText so Pi gets file/folder references.
 */
export function applyContextAsFileMention(sessionId: string, items: ContextAttachItemView[]): void {
  if (!items?.length) return;
  const keys = new Set<string>([sessionId, "__pending__"]);
  const map = get(contextAttachChips);
  for (const key of Object.keys(map)) {
    if (key && key !== "__pending__") keys.add(key);
  }
  for (const key of keys) addContextChips(key, items);
  showToast("info", `已添加上下文 ×${items.length}`);
}

export function removeContextMention(sessionId: string, chipId: string): void {
  const map = get(contextAttachChips);
  const lists = [sessionId, "__pending__", ...Object.keys(map)];
  let chip: ContextAttachItemView | undefined;
  for (const key of lists) {
    const list = map[key] ?? [];
    chip = list.find((c) => c.id === chipId);
    if (chip) {
      removeContextChip(key, chipId);
      break;
    }
  }
  removeContextChip(sessionId, chipId);
  removeContextChip("__pending__", chipId);
  if (!chip) return;
  // Remove any legacy path tokens if they were typed/pasted manually.
  const tokens = [chip.insertText, `\`${chip.path}\``, chip.path]
    .map((t) => (t || "").trim())
    .filter(Boolean);
  let text = getDraft(sessionId).text;
  if (!text) return;
  let changed = false;
  for (const token of tokens) {
    if (text.includes(token)) {
      text = text.split(token).join(" ");
      changed = true;
    }
  }
  if (!changed) return;
  text = text.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  setDraftText(sessionId, "webview", text);
}

export function stripContextMentions(sessionId: string, chips: ContextAttachItemView[]): string {
  let text = getDraft(sessionId).text;
  for (const chip of chips) {
    const tokens = [chip.insertText, `\`${chip.path}\``].map((t) => (t || "").trim()).filter(Boolean);
    for (const token of tokens) text = text.split(token).join(" ");
  }
  return text.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function chipsForComposer(map: Record<string, ContextAttachItemView[]>, sessionId: string): ContextAttachItemView[] {
  const a = map[sessionId] ?? [];
  const b = map["__pending__"] ?? [];
  const seen = new Set<string>();
  const out: ContextAttachItemView[] = [];
  for (const chip of [...a, ...b]) {
    const key = `${chip.kind}:${chip.path}:${chip.startLine ?? ""}:${chip.endLine ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
  }
  return out;
}

/** Prefix sent to Pi — chips stay invisible in the editor. */
export function chipsToPromptPrefix(chips: ContextAttachItemView[]): string {
  return chips
    .map((c) => (c.insertText || `\`${c.path}\``).trim())
    .filter(Boolean)
    .join(" ");
}
