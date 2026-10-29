import { describe, expect, it } from "vitest";

import type { AgentTurnItemView, AgentTurnView } from "../../src/shared/model/conversationModel.js";
import type { ToolCallStatus } from "../../src/shared/model/toolCallModel.js";
import { liveStepId } from "../../src/webview/features/conversation/liveStep.js";

describe("liveStepId", () => {
  it("finds nothing once the turn is over", () => {
    for (const status of ["completed", "aborted", "error"] as const) {
      expect(liveStepId(turn(status, [tool("t1", "running"), reasoning("r1", "streaming")]))).toBeNull();
    }
  });

  it("finds nothing before the first step starts", () => {
    expect(liveStepId(turn("running", []))).toBeNull();
    expect(liveStepId(turn("running", [notice("n1")]))).toBeNull();
  });

  it("picks the reasoning the model is still writing", () => {
    expect(liveStepId(turn("running", [tool("t1", "complete"), reasoning("r1", "streaming")]))).toBe("r1");
  });

  it("ignores reasoning whose message finished", () => {
    expect(liveStepId(turn("running", [reasoning("r1", "complete")]))).toBeNull();
  });

  it("picks a tool call that is still being prepared", () => {
    expect(liveStepId(turn("running", [reasoning("r1", "streaming"), preparing("t1")]))).toBe("t1");
  });

  it("picks the last of several running tools", () => {
    expect(liveStepId(turn("running", [tool("t1", "running"), tool("t2", "running"), tool("t3", "running")]))).toBe("t3");
  });

  it("falls back to an earlier running tool once the last one ends", () => {
    expect(liveStepId(turn("running", [tool("t1", "running"), tool("t2", "complete")]))).toBe("t1");
    expect(liveStepId(turn("running", [tool("t1", "complete"), tool("t2", "error")]))).toBeNull();
  });

  it("stops counting reasoning after the model moved on to its reply", () => {
    // The reasoning keeps its message's `streaming` status while the reply is written.
    expect(liveStepId(turn("running", [reasoning("r1", "streaming"), response("a1")]))).toBeNull();
  });

  it("stops counting reasoning once a tool call followed it", () => {
    expect(liveStepId(turn("running", [reasoning("r1", "streaming"), tool("t1", "complete")]))).toBeNull();
  });

  it("looks past notices when deciding what is last", () => {
    expect(liveStepId(turn("running", [reasoning("r1", "streaming"), notice("n1")]))).toBe("r1");
  });
});

function turn(status: AgentTurnView["status"], items: AgentTurnItemView[]): AgentTurnView {
  return { id: "turn", type: "turn", status, items, startedAt: 0 };
}

function reasoning(id: string, status: "streaming" | "complete"): AgentTurnItemView {
  return { id, type: "reasoning", text: "thinking", status, timestamp: 0 };
}

function response(id: string): AgentTurnItemView {
  return { id, type: "response", blocks: [{ type: "text", text: "hi" }], status: "streaming", timestamp: 0 };
}

function notice(id: string): AgentTurnItemView {
  return { id, type: "notice", text: "note", level: "info", timestamp: 0 };
}

function tool(id: string, status: ToolCallStatus): AgentTurnItemView {
  return {
    id,
    type: "tool",
    timestamp: 0,
    tool: { state: "bound", id: `call-${id}`, name: "bash", label: "ls", args: {}, status, isError: status === "error", startedAt: 0 },
  };
}

function preparing(id: string): AgentTurnItemView {
  return {
    id,
    type: "tool",
    timestamp: 0,
    tool: { state: "preparing", rawArguments: "{", status: "running", isError: false, startedAt: 0 },
  };
}
