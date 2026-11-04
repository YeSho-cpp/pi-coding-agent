// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogSessionSummaryView, SessionSummaryView } from "../../src/shared/model/sessionViewModel.js";
import { postToHost } from "../../src/webview/bridge/vscodeBridge.js";
import OnboardingView from "../../src/webview/features/onboarding/OnboardingView.svelte";
import { pendingSessionOpen } from "../../src/webview/state/sessionViewStore.svelte.js";

vi.mock("../../src/webview/bridge/vscodeBridge.js", () => ({
  postToHost: vi.fn(),
  onHostMessage: vi.fn(() => () => undefined),
}));

/**
 * The welcome page's session rows are read the way a user uses them: click a row, press keys on it,
 * open its "…" menu, rename. A row opens its session, so keys that belong to something inside the
 * row — the rename box, the "…" button, a menu item — must stay with that thing.
 */

const posted = vi.mocked(postToHost);

function live(id: string, title = `Live ${id}`): SessionSummaryView {
  return {
    id,
    title,
    cwd: "/work/app",
    status: "ready",
    isActive: false,
    isEphemeral: false,
    historyStatus: "loaded",
    requiresUserInput: false,
  };
}

function history(name: string): CatalogSessionSummaryView {
  return { path: `/home/.pi/${name}.jsonl`, title: `History ${name}`, cwd: "/work/app", updatedAt: Date.now() - 3_600_000 };
}

function mount() {
  return render(OnboardingView, { props: { sessions: [live("a"), live("b")], catalogSessions: [history("one")] } });
}

function rowTitled(title: string): HTMLElement {
  const row = [...document.querySelectorAll<HTMLElement>(".ob-session-row")]
    .find((candidate) => candidate.querySelector(".ob-session-title")?.textContent?.includes(title));
  if (!row) throw new Error(`No row titled ${title}`);
  return row;
}

const moreButtonOf = (row: HTMLElement): HTMLElement => within(row).getByLabelText("会话更多操作");

function sentOfType(type: string): Record<string, unknown>[] {
  return posted.mock.calls.map(([message]) => message as Record<string, unknown>).filter((message) => message.type === type);
}

function opened(): boolean {
  return sentOfType("activateSession").length + sentOfType("openCatalogSession").length > 0 || get(pendingSessionOpen);
}

async function startRename(title: string): Promise<HTMLInputElement> {
  await fireEvent.click(moreButtonOf(rowTitled(title)));
  await fireEvent.click(screen.getByRole("menuitem", { name: /重命名会话/ }));
  return document.querySelector<HTMLInputElement>(".ob-rename-input")!;
}

beforeEach(() => {
  posted.mockClear();
  pendingSessionOpen.set(false);
});

afterEach(() => {
  cleanup();
});

describe("opening a session from its row", () => {
  it("opens a live session, or a history session by its file, on click", async () => {
    mount();

    await fireEvent.click(rowTitled("Live b"));
    expect(sentOfType("activateSession")).toEqual([{ type: "activateSession", sessionId: "b" }]);

    posted.mockClear();
    await fireEvent.click(rowTitled("History one"));
    expect(sentOfType("openCatalogSession")).toEqual([{ type: "openCatalogSession", path: "/home/.pi/one.jsonl" }]);
    expect(get(pendingSessionOpen)).toBe(true);
  });

  it.each(["Enter", " "])("opens the focused row on %j", async (key) => {
    mount();

    expect(await fireEvent.keyDown(rowTitled("Live a"), { key })).toBe(false);

    expect(sentOfType("activateSession")).toEqual([{ type: "activateSession", sessionId: "a" }]);
  });

  it("ignores other keys on the row", async () => {
    mount();

    expect(await fireEvent.keyDown(rowTitled("Live a"), { key: "a" })).toBe(true);
    expect(await fireEvent.keyDown(rowTitled("Live a"), { key: "Tab" })).toBe(true);

    expect(opened()).toBe(false);
  });

  it("does not open a row while a menu is up", async () => {
    mount();
    await fireEvent.click(moreButtonOf(rowTitled("Live a")));

    await fireEvent.click(rowTitled("Live b"));

    expect(opened()).toBe(false);
  });
});

describe("renaming a session", () => {
  it("lets a space be typed in the name box", async () => {
    mount();
    const input = await startRename("Live a");

    expect(await fireEvent.keyDown(input, { key: " " })).toBe(true);
    expect(opened()).toBe(false);
  });

  it("renames on Enter, with the spaces typed, and does not open the session", async () => {
    mount();
    const input = await startRename("Live a");

    await fireEvent.input(input, { target: { value: "Fix the flaky test" } });
    expect(await fireEvent.keyDown(input, { key: "Enter" })).toBe(false);

    expect(sentOfType("renameSession")).toEqual([{ type: "renameSession", sessionId: "a", name: "Fix the flaky test" }]);
    expect(opened()).toBe(false);
    expect(document.querySelector(".ob-rename-input")).toBeNull();
  });

  it("renames a history session through its file, and does not open it", async () => {
    mount();
    const input = await startRename("History one");

    await fireEvent.input(input, { target: { value: "Old but useful" } });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(sentOfType("renameCatalogSession")).toEqual([
      { type: "renameCatalogSession", path: "/home/.pi/one.jsonl", name: "Old but useful" },
    ]);
    expect(opened()).toBe(false);
  });

  it("saves nothing when the name is unchanged, blank, or abandoned with Escape", async () => {
    mount();

    let input = await startRename("Live a");
    await fireEvent.keyDown(input, { key: "Enter" });

    input = await startRename("Live a");
    await fireEvent.input(input, { target: { value: "   " } });
    await fireEvent.keyDown(input, { key: "Enter" });

    input = await startRename("Live a");
    await fireEvent.input(input, { target: { value: "Dropped" } });
    await fireEvent.keyDown(input, { key: "Escape" });

    expect(sentOfType("renameSession")).toEqual([]);
    expect(opened()).toBe(false);
    expect(document.querySelector(".ob-rename-input")).toBeNull();
  });
});

describe("keys on the controls inside a row", () => {
  it.each(["Enter", " "])("leave %j on the … button to the button, so it can open its menu from the keyboard", async (key) => {
    mount();

    expect(await fireEvent.keyDown(moreButtonOf(rowTitled("Live a")), { key })).toBe(true);

    expect(opened()).toBe(false);
  });

  it.each(["Enter", " "])("leave %j on a menu item to the item, so the menu works from the keyboard", async (key) => {
    mount();
    await fireEvent.click(moreButtonOf(rowTitled("Live a")));

    expect(await fireEvent.keyDown(screen.getByRole("menuitem", { name: /删除会话/ }), { key })).toBe(true);

    expect(opened()).toBe(false);
  });

  it("still lets the … button open its menu and the menu delete the session", async () => {
    mount();

    await fireEvent.click(moreButtonOf(rowTitled("Live a")));
    await fireEvent.click(screen.getByRole("menuitem", { name: /删除会话/ }));

    expect(sentOfType("closeSession")).toEqual([{ type: "closeSession", sessionId: "a" }]);
    expect(opened()).toBe(false);
  });
});
