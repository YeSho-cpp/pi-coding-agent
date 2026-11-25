// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionSummaryView } from "../../src/shared/model/sessionViewModel.js";
import { postToHost } from "../../src/webview/bridge/vscodeBridge.js";
import SessionList from "../../src/webview/features/sessions/SessionList.svelte";

vi.mock("../../src/webview/bridge/vscodeBridge.js", () => ({
  postToHost: vi.fn(),
  onHostMessage: vi.fn(() => () => undefined),
}));

const posted = vi.mocked(postToHost);
const now = Date.now();

function session(id: string, title: string, updatedAt: number, overrides: Partial<SessionSummaryView> = {}): SessionSummaryView {
  return {
    id,
    title,
    cwd: "/work/app",
    status: "ready",
    isActive: false,
    isEphemeral: false,
    historyStatus: "loaded",
    requiresUserInput: false,
    updatedAt,
    ...overrides,
  };
}

function mount(sessions: SessionSummaryView[], activeId = sessions[0]?.id ?? "none") {
  return render(SessionList, {
    props: {
      sessions,
      activeId,
      onselect: vi.fn(),
      onclose: vi.fn(),
      onexternalize: vi.fn(),
      oncreate: vi.fn(),
      onresume: vi.fn(),
    },
  });
}

function titles(): string[] {
  return [...document.querySelectorAll<HTMLElement>(".session-list-title")].map((row) => row.textContent?.trim() ?? "");
}

afterEach(() => {
  cleanup();
  posted.mockClear();
});

describe("SessionList", () => {
  it("orders rows by last use, newest first", () => {
    mount([
      session("old", "Older session", now - 20 * 86_400_000),
      session("new", "Newest session", now - 60_000),
      session("mid", "Middle session", now - 3 * 3_600_000),
    ]);
    expect(titles()).toEqual(["Newest session", "Middle session", "Older session"]);
  });

  it("labels each row with a compact age", () => {
    mount([
      session("new", "Newest session", now - 60_000),
      session("old", "Older session", now - 20 * 86_400_000),
    ]);
    const ages = [...document.querySelectorAll<HTMLElement>(".session-list-age")].map((row) => row.textContent);
    expect(ages).toEqual(["1m", "20d"]);
  });

  it("shows now for a running session and dates anything past a month", () => {
    mount([
      session("busy", "Running session", now - 9 * 86_400_000, { status: "running" }),
      session("stale", "Stale session", new Date(2024, 8, 5, 12, 0).getTime()),
    ]);
    const ages = [...document.querySelectorAll<HTMLElement>(".session-list-age")].map((row) => row.textContent);
    expect(ages[0]).toBe("now");
    expect(ages[1]).toBe("2024/9/5");
  });

  it("hides the age when it cannot be known", () => {
    mount([session("broken", "Broken session", 0)]);
    expect(document.querySelector(".session-list-age")).toBeNull();
  });
});
