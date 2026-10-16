import type { AgentTurnView } from "$shared/model/conversationModel";

export interface TurnChangeFile {
  path: string;
  added: number;
  removed: number;
  /** First edit of this file in the turn — its snapshot covers the whole turn's net change. */
  firstToolCallId: string;
}

/** Line prefixes the diff renderer already classifies as add/remove (`!` is Pi's replace-add). */
export function diffLineCounts(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+") || line.startsWith("!")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }
  return { added, removed };
}

/**
 * Files this turn actually rewrote: tool calls that carry both a recognized path and a
 * display diff. Bash-driven edits have no diff and stay invisible, same as any other agent UI.
 * Repeated edits to one file aggregate into a single row.
 */
export function summarizeTurnChanges(turn: AgentTurnView): TurnChangeFile[] {
  const byPath = new Map<string, TurnChangeFile>();
  for (const item of turn.items) {
    if (item.type !== "tool" || item.tool.state !== "bound") continue;
    const path = item.tool.recognized?.location?.path;
    const diff = item.tool.recognized?.diff;
    if (!path || !diff) continue;
    const { added, removed } = diffLineCounts(diff);
    if (added === 0 && removed === 0) continue;
    const existing = byPath.get(path);
    if (existing) {
      existing.added += added;
      existing.removed += removed;
    } else {
      byPath.set(path, { path, added, removed, firstToolCallId: item.tool.id });
    }
  }
  return [...byPath.values()];
}
