import { writable } from "svelte/store";

import type { ContextAttachItemView } from "$shared/model/contextAttachModel";

/** Per-session Copilot-style context chips (file / selection / folder). */
export const contextAttachChips = writable<Record<string, ContextAttachItemView[]>>({});

function hasChip(list: ContextAttachItemView[], item: ContextAttachItemView): boolean {
  return list.some(
    (chip) =>
      chip.kind === item.kind &&
      chip.path === item.path &&
      chip.startLine === item.startLine &&
      chip.endLine === item.endLine,
  );
}

export function addContextChips(sessionId: string, items: ContextAttachItemView[]): void {
  if (!items.length) return;
  contextAttachChips.update((map) => {
    const current = map[sessionId] ?? [];
    const next = [...current];
    for (const item of items) {
      if (!hasChip(next, item)) next.push(item);
    }
    return { ...map, [sessionId]: next.slice(0, 64) };
  });
}

export function removeContextChip(sessionId: string, id: string): void {
  contextAttachChips.update((map) => {
    const current = map[sessionId] ?? [];
    return { ...map, [sessionId]: current.filter((chip) => chip.id !== id) };
  });
}

export function clearContextChips(sessionId: string): void {
  contextAttachChips.update((map) => {
    if (!map[sessionId]?.length) return map;
    return { ...map, [sessionId]: [] };
  });
}

export function contextChipPromptPrefix(items: ContextAttachItemView[]): string {
  if (!items.length) return "";
  return items
    .map((item) => item.insertText.trim())
    .filter(Boolean)
    .join(" ");
}
