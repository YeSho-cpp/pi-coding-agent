// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionViewModel } from "../../src/shared/model/sessionViewModel.js";
import { postToHost } from "../../src/webview/bridge/vscodeBridge.js";
import ConversationView from "../../src/webview/features/conversation/ConversationView.svelte";
import { needsHistoryLoad } from "../../src/webview/features/conversation/historyGate.js";

vi.mock("../../src/webview/bridge/vscodeBridge.js", () => ({
  postToHost: vi.fn(),
  onHostMessage: vi.fn(() => () => undefined),
}));

const posted = vi.mocked(postToHost);

function session(overrides: Partial<SessionViewModel> = {}): SessionViewModel {
  return {
    id: "s1",
    title: "Session",
    status: "ready",
    cwd: "/work/app",
    historyStatus: "deferred",
    isStreaming: false,
    isCompacting: false,
    isForking: false,
    isNavigatingTree: false,
    isSummarizingTree: false,
    isEphemeral: false,
    conversationItems: [],
    queuedSteers: [],
    queuedFollowUps: [],
    pendingExtensionUi: [],
    conversationContentRevision: 0,
    ...overrides,
  } as unknown as SessionViewModel;
}

afterEach(() => {
  cleanup();
  posted.mockClear();
});

// The conversation surface follows its own height; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

describe("needsHistoryLoad", () => {
  it("asks only once the session is actually running something", () => {
    expect(needsHistoryLoad({ historyStatus: "deferred", status: "ready" })).toBe(true);
    expect(needsHistoryLoad({ historyStatus: "deferred", status: "running" })).toBe(true);
    expect(needsHistoryLoad({ historyStatus: "failed", status: "ready" })).toBe(true);
  });

  it("stays out of the way of a session that has not started or already has history", () => {
    expect(needsHistoryLoad({ historyStatus: "deferred", status: "stopped" })).toBe(false);
    expect(needsHistoryLoad({ historyStatus: "deferred", status: "queued" })).toBe(false);
    expect(needsHistoryLoad({ historyStatus: "loading", status: "ready" })).toBe(false);
    expect(needsHistoryLoad({ historyStatus: "loaded", status: "ready" })).toBe(false);
  });
});

describe("ConversationView history gate", () => {
  it("offers to load a history that was too large to open automatically", async () => {
    render(ConversationView, { props: { session: session() } });

    expect(screen.getByText("会话历史较大，没有自动加载")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "加载历史" }));
    expect(posted).toHaveBeenCalledWith({ type: "loadHistory", sessionId: "s1" });
  });

  it("offers a retry after a failed load", async () => {
    render(ConversationView, { props: { session: session({ historyStatus: "failed" }) } });

    expect(screen.getByText("历史加载失败")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(posted).toHaveBeenCalledWith({ type: "loadHistory", sessionId: "s1" });
  });

  it("waits for a running session to stop before loading", () => {
    render(ConversationView, { props: { session: session({ status: "running", isStreaming: true }) } });

    const button = document.querySelector<HTMLButtonElement>(".history-gate-button");
    expect(button?.textContent).toContain("加载历史");
    expect(button?.disabled).toBe(true);
    expect(screen.getByText("会话正在运行，停止后才能加载历史。")).toBeTruthy();
  });

  it("shows nothing extra once the history is loaded", () => {
    render(ConversationView, { props: { session: session({ historyStatus: "loaded" }) } });

    expect(document.querySelector(".history-gate")).toBeNull();
    expect(screen.getByText("开始对话")).toBeTruthy();
  });
});
