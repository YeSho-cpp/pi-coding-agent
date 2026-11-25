import { describe, expect, it } from "vitest";

import type { SessionSummaryView } from "../../src/shared/model/sessionViewModel.js";
import {
  formatSessionAge,
  idsByRecency,
  sessionAgeLabel,
} from "../../src/webview/features/sessions/sessionAge.js";

type AgeSource = Pick<SessionSummaryView, "status" | "requiresUserInput" | "updatedAt">;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const now = new Date(2025, 8, 5, 18, 0).getTime();

function session(updatedAt: number, overrides: Partial<AgeSource> = {}): AgeSource {
  return { status: "ready", requiresUserInput: false, updatedAt, ...overrides };
}

describe("formatSessionAge", () => {
  it("hides timestamps that carry no time", () => {
    expect(formatSessionAge(0, now)).toBeNull();
    expect(formatSessionAge(-1, now)).toBeNull();
    expect(formatSessionAge(Number.NaN, now)).toBeNull();
    expect(formatSessionAge(Number.POSITIVE_INFINITY, now)).toBeNull();
  });

  it("reads the first minute and any future clock skew as now", () => {
    expect(formatSessionAge(now, now)).toBe("now");
    expect(formatSessionAge(now - 59_999, now)).toBe("now");
    expect(formatSessionAge(now + 5 * MINUTE, now)).toBe("now");
  });

  it("counts minutes, hours, and days below the one-month boundary", () => {
    expect(formatSessionAge(now - MINUTE, now)).toBe("1m");
    expect(formatSessionAge(now - 59 * MINUTE, now)).toBe("59m");
    expect(formatSessionAge(now - HOUR, now)).toBe("1h");
    expect(formatSessionAge(now - 23 * HOUR, now)).toBe("23h");
    expect(formatSessionAge(now - DAY, now)).toBe("1d");
    expect(formatSessionAge(now - 29 * DAY, now)).toBe("29d");
  });

  it("switches to a calendar date from 30 days on", () => {
    expect(formatSessionAge(now - 30 * DAY, now)).toBe("8/6");
    expect(formatSessionAge(new Date(2025, 0, 3, 9, 0).getTime(), now)).toBe("1/3");
  });

  it("adds the year for dates from an earlier year", () => {
    expect(formatSessionAge(new Date(2024, 8, 5, 12, 0).getTime(), now)).toBe("2024/9/5");
  });
});

describe("sessionAgeLabel", () => {
  it("treats a running or attention-needing session as used right now", () => {
    const old = now - 5 * DAY;
    expect(sessionAgeLabel(session(old, { status: "running" }), now)).toBe("now");
    expect(sessionAgeLabel(session(old, { requiresUserInput: true }), now)).toBe("now");
    expect(sessionAgeLabel(session(old), now)).toBe("5d");
  });
});

describe("idsByRecency", () => {
  it("orders newest first and keeps the incoming order for ties", () => {
    const sessions = [
      { id: "old", status: "ready" as const, requiresUserInput: false, updatedAt: now - 3 * DAY },
      { id: "tie-b", status: "ready" as const, requiresUserInput: false, updatedAt: now - HOUR },
      { id: "tie-a", status: "ready" as const, requiresUserInput: false, updatedAt: now - HOUR },
      { id: "new", status: "ready" as const, requiresUserInput: false, updatedAt: now - MINUTE },
    ];
    expect(idsByRecency(sessions, now)).toEqual(["new", "tie-b", "tie-a", "old"]);
  });

  it("sorts a running session to the front without mutating the input", () => {
    const sessions = [
      { id: "idle", status: "ready" as const, requiresUserInput: false, updatedAt: now - MINUTE },
      { id: "busy", status: "running" as const, requiresUserInput: false, updatedAt: now - 7 * DAY },
    ];
    expect(idsByRecency(sessions, now)).toEqual(["busy", "idle"]);
    expect(sessions.map((entry) => entry.id)).toEqual(["idle", "busy"]);
  });
});
