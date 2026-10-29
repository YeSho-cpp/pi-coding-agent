// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentTurnItemView, AgentTurnView } from "../../src/shared/model/conversationModel.js";
import type { ToolCallStatus } from "../../src/shared/model/toolCallModel.js";
import AgentTurn from "../../src/webview/features/conversation/AgentTurn.svelte";
import { LIVE_EXPAND_DELAY_MS } from "../../src/webview/features/conversation/liveStep.js";

/**
 * A running turn unfolds one row — the last step still in progress — and leaves every other
 * row as a one-line summary. The rows are read through the open state bits-ui puts on each
 * row's root, which is what the reader sees change.
 */

const session = { id: "s1", cwd: "/work", collapseTurnTrace: false } as never;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a running turn", () => {
  it("unfolds the step in progress only after it has stayed in progress for a moment", async () => {
    mount(running([tool("t1", "complete"), tool("t2", "running")]));
    await settle(0);
    expect(states()).toEqual(["closed", "closed"]);

    await settle(LIVE_EXPAND_DELAY_MS - 1);
    expect(states()).toEqual(["closed", "closed"]);

    await settle(1);
    expect(states()).toEqual(["closed", "open"]);
  });

  it("never opens a step that ends before the delay", async () => {
    const view = mount(running([tool("t1", "running")]));
    await settle(LIVE_EXPAND_DELAY_MS - 100);
    await view.rerender({ turn: running([tool("t1", "complete")]) });
    await settle(LIVE_EXPAND_DELAY_MS * 2);

    expect(states()).toEqual(["closed"]);
  });

  it("folds the step when it ends and unfolds the next one after the delay", async () => {
    const view = mount(running([tool("t1", "running")]));
    await settle(LIVE_EXPAND_DELAY_MS);
    expect(states()).toEqual(["open"]);

    await view.rerender({ turn: running([tool("t1", "complete"), tool("t2", "running")]) });
    await settle(0);
    expect(states()).toEqual(["closed", "closed"]);

    await settle(LIVE_EXPAND_DELAY_MS);
    expect(states()).toEqual(["closed", "open"]);
  });

  it("unfolds a reasoning while it is being written and shows it as thinking", async () => {
    mount(running([tool("t1", "complete"), reasoning("r1", "streaming")]));
    await settle(LIVE_EXPAND_DELAY_MS);

    expect(states()).toEqual(["closed", "open"]);
    expect(rows()[1]!.textContent).toContain("Thinking");
  });

  it("calls a reasoning finished once the reply is being written, though its message still streams", async () => {
    mount(running([reasoning("r1", "streaming"), response("a1")]));
    await settle(LIVE_EXPAND_DELAY_MS);

    expect(states()).toEqual(["closed"]);
    expect(rows()[0]!.textContent).toContain("Reasoning");
    expect(rows()[0]!.textContent).not.toContain("Thinking");
  });

  it("keeps a row the reader opened open when the step moves on", async () => {
    const view = mount(running([tool("t1", "complete"), tool("t2", "running")]));
    await settle(LIVE_EXPAND_DELAY_MS);
    await fireEvent.click(trigger(0));
    expect(states()).toEqual(["open", "open"]);

    await view.rerender({ turn: running([tool("t1", "complete"), tool("t2", "complete")]) });
    await settle(LIVE_EXPAND_DELAY_MS);
    expect(states()).toEqual(["open", "closed"]);
  });

  it("keeps a row the reader folded folded while it is still in progress", async () => {
    mount(running([tool("t1", "running")]));
    await settle(LIVE_EXPAND_DELAY_MS);
    await fireEvent.click(trigger(0));
    expect(states()).toEqual(["closed"]);

    await settle(LIVE_EXPAND_DELAY_MS * 3);
    expect(states()).toEqual(["closed"]);
  });

  it("unfolds nothing once the turn has finished", async () => {
    const view = mount(running([tool("t1", "running")]));
    await settle(LIVE_EXPAND_DELAY_MS);
    expect(states()).toEqual(["open"]);

    await view.rerender({ turn: { ...running([tool("t1", "complete")]), status: "completed" } });
    await settle(LIVE_EXPAND_DELAY_MS);
    expect(states()).toEqual(["closed"]);
  });
});

function mount(turn: AgentTurnView) {
  return render(AgentTurn, { props: { turn, session } });
}

async function settle(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await tick();
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".activity-row")];
}

function states(): (string | null)[] {
  return rows().map((row) => row.getAttribute("data-state"));
}

function trigger(index: number): HTMLElement {
  return rows()[index]!.querySelector<HTMLElement>(".activity-trigger")!;
}

function running(items: AgentTurnItemView[]): AgentTurnView {
  return { id: "turn-1", type: "turn", status: "running", items, startedAt: 0 };
}

function reasoning(id: string, status: "streaming" | "complete"): AgentTurnItemView {
  return { id, type: "reasoning", text: "Weighing the options.", status, timestamp: 0 };
}

function response(id: string): AgentTurnItemView {
  return { id, type: "response", blocks: [{ type: "text", text: "Here is the answer." }], status: "streaming", timestamp: 0 };
}

function tool(id: string, status: ToolCallStatus): AgentTurnItemView {
  return {
    id,
    type: "tool",
    timestamp: 0,
    tool: {
      state: "bound",
      id: `call-${id}`,
      name: "bash",
      label: "ls",
      args: { command: "ls" },
      status,
      isError: false,
      startedAt: 0,
    },
  };
}
