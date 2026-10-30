import type { RpcSessionEntry } from "@frostime/pi-rpc";
import { describe, expect, it } from "vitest";

import {
  buildSessionTreeIndex,
  projectActiveBranchEdges,
  projectBranchEndChoices,
  projectEditableTarget,
} from "../../src/extension/sessions/tree/sessionTreeProjection.js";
import { SessionEntryState } from "../../src/extension/sessions/SessionEntryState.js";

const entries: RpcSessionEntry[] = [
  entry("root", null, 1, "user", "Start"),
  entry("a", "root", 2, "assistant", "A answer"),
  entry("branch-a", "a", 3, "user", "Keep parser"),
  entry("branch-a-end", "branch-a", 4, "assistant", "Parser kept"),
  entry("branch-b", "a", 5, "user", "Use library"),
  entry("nested-a", "branch-b", 6, "assistant", "Library answer"),
  entry("nested-a-user", "nested-a", 7, "user", "Try adapter"),
  entry("nested-a-end", "nested-a-user", 8, "assistant", "Adapter works"),
  entry("nested-b", "branch-b", 9, "assistant", "Library alternative"),
];

describe("session tree parent resolution", () => {
  it("matches the quadratic reference on random graphs", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const graphEntries = randomGraph(seed);
      const byId = new Map(graphEntries.map((item) => [item.id, item]));
      const expected = new Map(graphEntries.map((item) => [item.id, referenceSafeParentId(item, byId)]));

      const actual = buildSessionTreeIndex(graphEntries, null).parentById;

      expect([...actual]).toEqual([...expected]);
    }
  });
});

describe("session tree projection", () => {
  it("projects branch controls from exact active parent-child edges", () => {
    const state = new SessionEntryState();
    const { index } = state.replace(entries, "nested-a-end");

    expect(projectActiveBranchEdges(index)).toEqual([
      { branchPointId: "a", activeChildEntryId: "branch-b", pathCount: 3 },
      { branchPointId: "branch-b", activeChildEntryId: "nested-a", pathCount: 2 },
    ]);
  });

  it("projects a virtual-root edge when the session has multiple roots", () => {
    const rootBranches = [
      entry("root-a", null, 1, "user", "First root"),
      entry("root-a-end", "root-a", 2, "assistant", "First end"),
      entry("root-b", null, 3, "user", "Second root"),
      entry("root-b-end", "root-b", 4, "assistant", "Second end"),
    ];
    const state = new SessionEntryState();
    const { index } = state.replace(rootBranches, "root-b-end");

    expect(projectActiveBranchEdges(index)).toEqual([
      { branchPointId: null, activeChildEntryId: "root-b", pathCount: 2 },
    ]);
  });

  it("derives reachable branch ends without using message text as identity", () => {
    const index = buildSessionTreeIndex(entries, "nested-a-end");

    expect(projectBranchEndChoices(index, "a").map((choice) => choice.targetId)).toEqual([
      "nested-a-end",
      "nested-b",
      "branch-a-end",
    ]);
    expect(projectBranchEndChoices(index, "a")[0]).toMatchObject({ isCurrent: true, messageCount: 4 });
  });

  it("includes a current non-terminal position and orders other ends newest first", () => {
    const index = buildSessionTreeIndex(entries, "branch-b");
    const choices = projectBranchEndChoices(index, "a");

    expect(choices.map((choice) => [choice.targetId, choice.isCurrent])).toEqual([
      ["branch-b", true],
      ["nested-b", false],
      ["nested-a-end", false],
      ["branch-a-end", false],
    ]);
    expect(choices[0]).toMatchObject({ isEditable: true });
  });

  it("projects user text and images only when navigation requests the target", () => {
    const target: RpcSessionEntry = {
      type: "message",
      id: "editable",
      parentId: "root",
      message: {
        role: "user",
        content: [
          { type: "text", text: "first" },
          { type: "image", mimeType: "image/png", data: "AA==", fileName: "shot.png", size: 1 },
          { type: "text", text: "second" },
        ],
        attachments: [{ type: "image", mimeType: "image/jpeg", content: "/w==", fileName: "extra.jpg", size: 1 }],
      },
    };

    expect(projectEditableTarget(target)).toEqual({
      entryId: "editable",
      text: "first\nsecond",
      images: [
        expect.objectContaining({ name: "shot.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AA==" }),
        expect.objectContaining({ name: "extra.jpg", mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,/w==" }),
      ],
    });
    expect(projectEditableTarget(entries[1]!)).toBeNull();
  });

  it("uses bounded type and id labels when a branch end has no displayable content", () => {
    const metadata: RpcSessionEntry = {
      type: "model_change",
      id: "123456789",
      parentId: null,
      timestamp: new Date(1).toISOString(),
    };
    const index = buildSessionTreeIndex([metadata], metadata.id);

    expect(projectBranchEndChoices(index, null)[0]).toMatchObject({
      label: "model_change · 12345678",
      detail: "Ends with model_change: model_change · 12345678",
    });
  });
});

function entry(
  id: string,
  parentId: string | null,
  timestamp: number,
  role: string,
  text: string,
): RpcSessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: new Date(timestamp).toISOString(),
    message: { role, content: text, timestamp },
  };
}

function randomGraph(seed: number): RpcSessionEntry[] {
  let state = seed >>> 0;
  const random = (limit: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % limit;
  };
  const size = random(41);
  const ids = Array.from({ length: size }, (_, index) => `e${index}`);
  return ids.map((id) => {
    const choice = random(5);
    const parentId =
      choice === 0 ? null
      : choice === 1 ? id
      : choice === 2 ? "missing"
      : (ids[random(size)] ?? null);
    return { type: "message", id, parentId, timestamp: "2024-01-01T00:00:00.000Z" };
  });
}

function referenceSafeParentId(
  item: RpcSessionEntry,
  entriesById: ReadonlyMap<string, RpcSessionEntry>,
): string | null {
  const parentId = item.parentId;
  if (!parentId || !entriesById.has(parentId) || parentId === item.id) return null;

  const seen = new Set([item.id]);
  let currentId: string | null = parentId;
  while (currentId) {
    if (seen.has(currentId)) return null;
    seen.add(currentId);
    const current = entriesById.get(currentId);
    currentId = current?.parentId && entriesById.has(current.parentId) ? current.parentId : null;
  }
  return parentId;
}
