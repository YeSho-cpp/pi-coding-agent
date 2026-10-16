import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { applyPatch, formatPatch, parsePatch, reversePatch } from "diff";

export interface EditBaseSnapshot {
  path: string;
  base: string;
}

const MAX_ENTRIES = 50;
const cache = new Map<string, EditBaseSnapshot>();

export function getEditBaseSnapshot(toolCallId: string): EditBaseSnapshot | undefined {
  const hit = cache.get(toolCallId);
  if (hit) {
    // LRU refresh: re-insert so the most recently opened/recorded snapshot survives eviction.
    cache.delete(toolCallId);
    cache.set(toolCallId, hit);
  }
  return hit;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * Captures the pre-edit file content the moment Pi reports a successful edit.
 * At result time the on-disk file *is* this edit's output, so reverse-applying the
 * result's unified patch reconstructs the exact base — no race with the write.
 * Only live results qualify: replayed history would reverse-apply against a file
 * that has long since moved on, and openDiff falls back to the Git HEAD view then.
 */
export async function recordEditBaseFromResult(
  toolCallId: string,
  path: string | undefined,
  result: unknown,
): Promise<void> {
  if (!path || !isAbsolute(path)) return;
  const details = record(record(result)?.details);
  const patch = details?.patch;
  if (typeof patch !== "string" || !patch) return;
  try {
    const disk = await readFile(path, "utf8");
    const reversed = formatPatch(reversePatch(parsePatch(patch)));
    const base = applyPatch(disk, reversed);
    if (base === false) return;
    cache.delete(toolCallId);
    cache.set(toolCallId, { path, base });
    while (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  } catch {
    /* unreadable file or unapplicable patch: the strip's click falls back to HEAD */
  }
}

export function clearEditBaseSnapshots(): void {
  cache.clear();
}
