import { describe, expect, it } from "vitest";

import type { AgentTurnView } from "../../src/shared/model/conversationModel";
import type { BoundToolCallView } from "../../src/shared/model/toolCallModel";
import { diffLineCounts, summarizeTurnChanges } from "../../src/webview/features/conversation/turnChanges";

function boundTool(id: string, path: string | undefined, diff: string | undefined): BoundToolCallView {
  return {
    state: "bound",
    id,
    name: "edit",
    label: path ?? "edit",
    args: {},
    status: "complete",
    isError: false,
    startedAt: 0,
    ...(path ? { recognized: { location: { path }, ...(diff !== undefined ? { diff } : {}) } } : {}),
  };
}

function turnWith(tools: BoundToolCallView[]): AgentTurnView {
  return {
    id: "turn-1",
    type: "turn",
    status: "completed",
    startedAt: 0,
    items: tools.map((tool, index) => ({ id: `item-${index}`, type: "tool" as const, tool, timestamp: 0 })),
  };
}

describe("diffLineCounts", () => {
  it("counts unified-diff additions and deletions, skipping file headers", () => {
    const diff = [
      "--- a/sync.go",
      "+++ b/sync.go",
      "@@ -1,3 +1,4 @@",
      " context",
      "-old line",
      "+new line",
      "+another",
    ].join("\n");

    expect(diffLineCounts(diff)).toEqual({ added: 2, removed: 1 });
  });

  it("treats the replace-add marker as an addition", () => {
    expect(diffLineCounts("!replaced\n-old")).toEqual({ added: 1, removed: 1 });
  });
});

describe("summarizeTurnChanges", () => {
  it("lists files that carry both a path and a diff", () => {
    const turn = turnWith([
      boundTool("t1", "/repo/a.go", "+x\n+y"),
      boundTool("t2", "/repo/b.go", undefined),
      boundTool("t3", undefined, "+x"),
      boundTool("t4", "/repo/empty.diff", "--- a\n+++ b\n@@ -1 +1 @@\n same"),
    ]);

    expect(summarizeTurnChanges(turn)).toEqual([
      { path: "/repo/a.go", added: 2, removed: 0, firstToolCallId: "t1" },
    ]);
  });

  it("aggregates repeated edits to the same file in first-seen order", () => {
    const turn = turnWith([
      boundTool("t1", "/repo/a.go", "+one"),
      boundTool("t2", "/repo/b.go", "-gone"),
      boundTool("t3", "/repo/a.go", "+two\n-three"),
    ]);

    expect(summarizeTurnChanges(turn)).toEqual([
      { path: "/repo/a.go", added: 2, removed: 1, firstToolCallId: "t1" },
      { path: "/repo/b.go", added: 0, removed: 1, firstToolCallId: "t2" },
    ]);
  });
});
