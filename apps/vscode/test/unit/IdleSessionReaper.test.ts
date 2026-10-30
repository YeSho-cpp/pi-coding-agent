import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { IdleSessionReaper, isIdleSession, type ReapCandidate } from "../../src/extension/sessions/IdleSessionReaper.js";
import type { SessionViewModel } from "../../src/shared/model/sessionViewModel.js";

const MINUTE = 60_000;

describe("IdleSessionReaper", () => {
  let now = 10 * 60 * MINUTE;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 10 * 60 * MINUTE;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function reaper(
    candidates: ReapCandidate[],
    idleMinutes = 30,
    stop: Mock<(id: string) => Promise<void>> = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
  ) {
    return {
      stop,
      reaper: new IdleSessionReaper({
        idleMs: () => idleMinutes * MINUTE,
        candidates: () => candidates,
        stop,
        now: () => now,
      }),
    };
  }

  it("stops only the sessions idle for at least the configured time", async () => {
    const { reaper: sweeper, stop } = reaper([
      { id: "old", lastActiveAt: now - 31 * MINUTE },
      { id: "exact", lastActiveAt: now - 30 * MINUTE },
      { id: "recent", lastActiveAt: now - 29 * MINUTE },
    ]);

    expect(await sweeper.sweep()).toEqual(["old", "exact"]);
    expect(stop.mock.calls.map(([id]) => id)).toEqual(["old", "exact"]);
  });

  it("keeps every session running when the setting is 0", async () => {
    const { reaper: sweeper, stop } = reaper([{ id: "old", lastActiveAt: 0 }], 0);

    expect(await sweeper.sweep()).toEqual([]);
    expect(stop).not.toHaveBeenCalled();
  });

  it("carries on with the next session when a stop fails", async () => {
    const stop = vi.fn<(id: string) => Promise<void>>((id) => id === "stuck" ? Promise.reject(new Error("stop failed")) : Promise.resolve());
    const { reaper: sweeper } = reaper([
      { id: "stuck", lastActiveAt: 0 },
      { id: "fine", lastActiveAt: 0 },
    ], 30, stop);

    expect(await sweeper.sweep()).toEqual(["fine"]);
  });

  it("does not start a second sweep while one is still stopping sessions", async () => {
    let release: () => void = () => undefined;
    const stop = vi.fn<(id: string) => Promise<void>>(() => new Promise<void>((resolve) => { release = resolve; }));
    const { reaper: sweeper } = reaper([{ id: "old", lastActiveAt: 0 }], 30, stop);

    const first = sweeper.sweep();
    expect(await sweeper.sweep()).toEqual([]);
    release();
    expect(await first).toEqual(["old"]);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("sweeps on its own timer once armed, and stops when disposed", async () => {
    const { reaper: sweeper, stop } = reaper([{ id: "old", lastActiveAt: 0 }]);

    sweeper.ensureRunning();
    sweeper.ensureRunning();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(stop).toHaveBeenCalledTimes(1);

    sweeper.dispose();
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is not armed until asked, and stays off after dispose", () => {
    const { reaper: sweeper } = reaper([]);
    expect(vi.getTimerCount()).toBe(0);

    sweeper.dispose();
    sweeper.ensureRunning();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("isIdleSession", () => {
  function view(overrides: Partial<SessionViewModel> = {}): SessionViewModel {
    return {
      status: "ready",
      isStreaming: false,
      isCompacting: false,
      isForking: false,
      isNavigatingTree: false,
      isSummarizingTree: false,
      pendingExtensionUi: [],
      queuedSteers: [],
      queuedFollowUps: [],
      ...overrides,
    } as SessionViewModel;
  }

  it("accepts a ready session with nothing going on", () => {
    expect(isIdleSession(view())).toBe(true);
  });

  it.each([
    ["running a turn", { status: "running" as const }],
    ["streaming", { isStreaming: true }],
    ["compacting", { isCompacting: true }],
    ["forking", { isForking: true }],
    ["navigating the tree", { isNavigatingTree: true }],
    ["summarizing a branch", { isSummarizingTree: true }],
    ["waiting for the user", { pendingExtensionUi: [{ id: "q" }] as never }],
    ["holding a queued steer", { queuedSteers: [{ id: "s" }] as never }],
    ["holding a queued follow-up", { queuedFollowUps: [{ id: "f" }] as never }],
    ["already stopped", { status: "stopped" as const }],
    ["failed", { status: "failed" as const }],
    ["starting", { status: "starting" as const }],
  ])("rejects a session that is %s", (_label, overrides) => {
    expect(isIdleSession(view(overrides))).toBe(false);
  });
});
