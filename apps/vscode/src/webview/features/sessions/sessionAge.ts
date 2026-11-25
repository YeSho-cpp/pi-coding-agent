import type { SessionSummaryView } from "$shared/model/sessionViewModel";

type SessionAgeSource = Pick<SessionSummaryView, "status" | "requiresUserInput" | "updatedAt">;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RELATIVE_DAYS = 30;

/**
 * Compact "last used" label for the session list: `now`, `5m`, `3h`, `12d`, and from 30 days on a
 * calendar date (`9/5`, or `2024/9/5` in an earlier year). Invalid timestamps return `null` so the
 * row hides the label instead of showing 1970; a clock running ahead reads as `now`.
 */
export function formatSessionAge(timestamp: number, now = Date.now()): string | null {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const elapsed = now - timestamp;
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < RELATIVE_DAYS * DAY) return `${Math.floor(elapsed / DAY)}d`;
  const date = new Date(timestamp);
  const yearPrefix = date.getFullYear() === new Date(now).getFullYear() ? "" : `${date.getFullYear()}/`;
  return `${yearPrefix}${date.getMonth() + 1}/${date.getDate()}`;
}

/** A session that is running or waiting for the user is in use right now, whatever its stored time says. */
export function sessionLastUsedAt(session: SessionAgeSource, now = Date.now()): number {
  if (session.status === "running" || session.requiresUserInput) return now;
  return session.updatedAt;
}

export function sessionAgeLabel(session: SessionAgeSource, now = Date.now()): string | null {
  return formatSessionAge(sessionLastUsedAt(session, now), now);
}

/** Session ids, most recently used first; sessions used at the same time keep their incoming order. */
export function idsByRecency(sessions: readonly (SessionAgeSource & { id: string })[], now = Date.now()): string[] {
  return sessions
    .map((session, index) => {
      const usedAt = sessionLastUsedAt(session, now);
      return { id: session.id, index, usedAt: Number.isFinite(usedAt) ? usedAt : 0 };
    })
    .sort((a, b) => b.usedAt - a.usedAt || a.index - b.index)
    .map((entry) => entry.id);
}
