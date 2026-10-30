// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { postToHost } from "../../src/webview/bridge/vscodeBridge.js";
import MarkdownContent from "../../src/webview/features/conversation/MarkdownContent.svelte";
import { deliverHighlightedCode } from "../../src/webview/features/conversation/markdown/highlightClient.js";

vi.mock("../../src/webview/bridge/vscodeBridge.js", () => ({
  postToHost: vi.fn(),
  onHostMessage: vi.fn(() => () => undefined),
}));

/**
 * A streaming answer grows many times a second. These pin what that must not cost: a rebuilt
 * block per token, a repaint per token, or a host round trip for every intermediate fence.
 */

const posted = vi.mocked(postToHost);

function highlightRequests(): { requestId: string; code: string }[] {
  return posted.mock.calls
    .map(([message]) => message as { type: string; requestId: string; code: string })
    .filter((message) => message.type === "highlightCode");
}

beforeEach(() => {
  vi.useFakeTimers();
  posted.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function settle(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await tick();
}

describe("streaming markdown", () => {
  it("keeps one mounted block while the text grows", async () => {
    const view = render(MarkdownContent, { props: { content: "Hello", streaming: true } });
    await settle(0);
    const block = document.querySelector(".markdown-body");

    await view.rerender({ content: "Hello world", streaming: true });
    await settle(150);

    expect(document.querySelector(".markdown-body")).toBe(block);
    expect(block?.textContent).toContain("Hello world");
  });

  it("repaints at most every 100ms while streaming, and the last text always lands", async () => {
    const view = render(MarkdownContent, { props: { content: "t0", streaming: true } });
    await settle(0);
    const block = document.querySelector(".markdown-body")!;
    expect(block.textContent).toContain("t0");

    for (const text of ["t1", "t12", "t123"]) {
      await view.rerender({ content: text, streaming: true });
      await settle(10);
    }
    expect(block.textContent).toContain("t0");

    await settle(100);
    expect(block.textContent).toContain("t123");
  });

  it("paints finished text at once, with no delay", async () => {
    const view = render(MarkdownContent, { props: { content: "before", streaming: false } });
    await settle(0);

    await view.rerender({ content: "after", streaming: false });
    await tick();

    expect(document.querySelector(".markdown-body")?.textContent).toContain("after");
  });
});

describe("fence highlighting", () => {
  const fence = (code: string) => "Code:\n\n```ts\n" + code + "\n```";

  it("asks the host once, after the fence stops changing, for the latest code only", async () => {
    const view = render(MarkdownContent, { props: { content: fence("const a = 1;"), streaming: true } });
    await settle(60);
    await view.rerender({ content: fence("const a = 1;\nconst b = 2;"), streaming: true });
    await settle(60);
    expect(highlightRequests()).toHaveLength(0);

    await settle(300);

    expect(highlightRequests().map((request) => request.code)).toEqual(["const a = 1;\nconst b = 2;\n"]);
  });

  it("repaints a fence the host already answered without asking again", async () => {
    const first = render(MarkdownContent, { props: { content: fence("let cached = true;"), streaming: false } });
    await settle(200);
    const [request] = highlightRequests();
    expect(request).toBeDefined();
    deliverHighlightedCode(request!.requestId, '<span class="tm">let cached = true;</span>');
    await settle(0);
    first.unmount();
    posted.mockClear();

    render(MarkdownContent, { props: { content: fence("let cached = true;"), streaming: false } });
    await settle(0);

    expect(document.querySelector("pre.hljs code")?.innerHTML).toBe('<span class="tm">let cached = true;</span>');
    await settle(400);
    expect(highlightRequests()).toHaveLength(0);
  });
});
