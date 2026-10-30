// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import TurnChangesStrip from "../../src/webview/features/conversation/TurnChangesStrip.svelte";
import type { TurnChangeFile } from "../../src/webview/features/conversation/turnChanges.js";

vi.mock("../../src/webview/bridge/vscodeBridge.js", () => ({
  postToHost: vi.fn(),
  onHostMessage: vi.fn(() => () => undefined),
}));

/**
 * The header is the card's own switch: a turn that touched four files can fold to one line,
 * and a long list keeps its separate "show all" fold inside the opened card.
 */

beforeAll(() => {
  // jsdom has no Web Animations API; Svelte 5 drives transitions through it.
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value() {
      const animation = { onfinish: null as (() => void) | null, finished: Promise.resolve(), cancel: () => undefined };
      setTimeout(() => animation.onfinish?.(), 0);
      return animation;
    },
  });
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
});

afterEach(() => {
  cleanup();
});

function files(count: number): TurnChangeFile[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `scripts/file-${index + 1}.sh`,
    added: count - index,
    removed: index,
    firstToolCallId: `tool-${index}`,
  }));
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".turn-change-row")];
}

function header(): HTMLElement {
  return screen.getByRole("button", { name: /已更改/ });
}

/** Opens or folds the card and lets the slide transition finish removing the body. */
async function clickHeader(): Promise<void> {
  await fireEvent.click(header());
  await new Promise((resolve) => setTimeout(resolve, 40));
}

describe("TurnChangesStrip", () => {
  it("starts folded to its summary line", () => {
    render(TurnChangesStrip, { props: { files: files(4), cwd: "/w" } });

    expect(header().getAttribute("aria-expanded")).toBe("false");
    expect(header().textContent).toContain("已更改 4 个文件");
    expect(header().textContent).toContain("+10");
    expect(rows()).toHaveLength(0);
  });

  it("opens from the header and folds back", async () => {
    const view = render(TurnChangesStrip, { props: { files: files(4), cwd: "/w" } });

    await clickHeader();
    expect(header().getAttribute("aria-expanded")).toBe("true");
    expect(view.container.querySelectorAll(".turn-change-row")).toHaveLength(4);

    await clickHeader();
    expect(header().getAttribute("aria-expanded")).toBe("false");
    expect(rows()).toHaveLength(0);
    expect(header().textContent).toContain("+10");
  });

  it("keeps the separate show-all fold for a long list", async () => {
    render(TurnChangesStrip, { props: { files: files(7), cwd: "/w" } });
    await clickHeader();
    expect(rows()).toHaveLength(5);

    await fireEvent.click(screen.getByRole("button", { name: "Show all 7 changed files" }));
    expect(rows()).toHaveLength(7);

    await clickHeader();
    expect(rows()).toHaveLength(0);
    await clickHeader();
    expect(rows()).toHaveLength(7);
  });

  it("needs no list toggle when every file fits", async () => {
    render(TurnChangesStrip, { props: { files: files(5), cwd: "/w" } });
    await clickHeader();

    expect(rows()).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });
});
