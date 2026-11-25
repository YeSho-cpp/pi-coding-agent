import type { SessionViewModel } from "$shared/model/sessionViewModel";

type HistoryGateSession = Pick<SessionViewModel, "historyStatus" | "status">;

/**
 * A runtime that has not started yet reports `deferred` as its default, which must not read as
 * "history is large": only a started session that skipped its history, or one that failed to load it,
 * needs the manual load.
 */
export function needsHistoryLoad(session: HistoryGateSession): boolean {
  if (session.historyStatus === "failed") return true;
  return session.historyStatus === "deferred" && (session.status === "ready" || session.status === "running");
}
