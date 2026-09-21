/** Per-session prompt history for ↑ / ↓ recall in the Composer (bash-like). */

interface PromptHistoryState {
  /** Oldest → newest submitted prompt text. */
  entries: string[];
  /** Cursor into entries; entries.length means "not browsing / at draft". */
  index: number;
  /** Draft text saved when history navigation starts. */
  stash: string;
}

const MAX_HISTORY = 80;
const states = new Map<string, PromptHistoryState>();

function stateOf(sessionId: string): PromptHistoryState {
  let state = states.get(sessionId);
  if (!state) {
    state = { entries: [], index: 0, stash: "" };
    states.set(sessionId, state);
  }
  return state;
}

/** Record a submitted prompt (call from Composer.submit). */
export function pushPromptHistory(sessionId: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const state = stateOf(sessionId);
  state.stash = "";
  if (state.entries[state.entries.length - 1] === trimmed) {
    state.index = state.entries.length;
    return;
  }
  state.entries.push(trimmed);
  if (state.entries.length > MAX_HISTORY) state.entries.shift();
  state.index = state.entries.length;
}

/**
 * Recall older/newer history. Returns replacement text, or null to keep default key behavior.
 * - up: previous entry (or first); saves current draft when leaving the end
 * - down: next entry; restores stashed draft at the end
 */
export function recallPromptHistory(
  sessionId: string,
  direction: "up" | "down",
  currentDoc: string,
): string | null {
  const state = states.get(sessionId);
  if (!state || state.entries.length === 0) return null;

  if (direction === "up") {
    if (state.index <= 0) return state.entries[0] ?? null;
    if (state.index >= state.entries.length) state.stash = currentDoc;
    state.index = Math.max(0, state.index - 1);
    return state.entries[state.index] ?? null;
  }

  if (state.index >= state.entries.length) return null;
  state.index += 1;
  if (state.index >= state.entries.length) return state.stash;
  return state.entries[state.index] ?? null;
}

/** After send/clear, snap navigation back to "draft" end. */
export function resetPromptHistoryNav(sessionId: string): void {
  const state = states.get(sessionId);
  if (!state) return;
  state.index = state.entries.length;
  state.stash = "";
}

export function promptHistoryLength(sessionId: string): number {
  return states.get(sessionId)?.entries.length ?? 0;
}
