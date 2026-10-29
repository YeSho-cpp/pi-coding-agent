// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stickToEnd } from "../../src/webview/features/conversation/stickToEnd.js";

/**
 * jsdom has no layout, so the block's geometry is stated by hand: 100px of window onto
 * 300px of text. What is under test is when the block follows its tail and when it lets go.
 */

let node: HTMLElement;
let handle: ReturnType<typeof stickToEnd>;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  node = document.createElement("pre");
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: 300 });
  Object.defineProperty(node, "clientHeight", { configurable: true, value: 100 });
});

afterEach(() => {
  handle.destroy();
  vi.unstubAllGlobals();
});

describe("stickToEnd", () => {
  it("follows streamed text to the end", async () => {
    handle = stickToEnd(node, true);

    node.append("more output");
    await Promise.resolve();

    expect(node.scrollTop).toBe(300);
  });

  it("leaves the block where it is while disabled", async () => {
    handle = stickToEnd(node, false);

    node.append("more output");
    await Promise.resolve();

    expect(node.scrollTop).toBe(0);
  });

  it("lets go when the reader scrolls up and picks up again at the end", async () => {
    handle = stickToEnd(node, true);

    node.scrollTop = 50;
    node.dispatchEvent(new Event("scroll"));
    node.append("a");
    await Promise.resolve();
    expect(node.scrollTop).toBe(50);

    node.scrollTop = 190;
    node.dispatchEvent(new Event("scroll"));
    node.append("b");
    await Promise.resolve();
    expect(node.scrollTop).toBe(300);
  });

  it("starts following when enabled later", () => {
    handle = stickToEnd(node, false);

    handle.update(true);

    expect(node.scrollTop).toBe(300);
  });
});
