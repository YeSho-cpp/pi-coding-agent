import type { RpcSessionEntry } from "@frostime/pi-rpc";
import { describe, expect, it } from "vitest";

import { SessionEntryPathError, SessionEntryState } from "../../src/extension/sessions/SessionEntryState.js";

describe("SessionEntryState parent resolution", () => {
  it("matches the quadratic reference on random graphs", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const entries = randomGraph(seed);
      const nodes = new Map(entries.map((entry) => [entry.id, { id: entry.id, parentId: entry.parentId }]));
      const expected = new Map(entries.map((entry) => [entry.id, referenceValidParentId(entry.id, nodes)]));

      const actual = new SessionEntryState().replace(entries, null).index.parentById;

      expect([...actual]).toEqual([...expected]);
    }
  });

  it("indexes a 20000-entry linear chain in linear time", () => {
    const size = 20000;
    const entries = Array.from({ length: size }, (_, i) => message(`n${i}`, i === 0 ? null : `n${i - 1}`, "user", "x"));

    const started = performance.now();
    const index = new SessionEntryState().replace(entries, `n${size - 1}`).index;
    const elapsed = performance.now() - started;

    expect(index.parentById.get("n0")).toBeNull();
    expect(index.parentById.get(`n${size - 1}`)).toBe(`n${size - 2}`);
    expect(index.activePath).toHaveLength(size);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("SessionEntryState", () => {
  it("selects the complete active path and retains only content-free tree nodes", () => {
    const state = new SessionEntryState();
    const update = state.replace([
      message("root", null, "user", "start"),
      message("answer", "root", "assistant", "answer"),
      message("abandoned", "answer", "user", "old branch"),
      message("active", "answer", "user", "new branch"),
    ], "active");

    expect(update.activePath.map((entry) => entry.id)).toEqual(["root", "answer", "active"]);
    expect(update.index.activePath).toEqual(["root", "answer", "active"]);
    expect(update.index.childrenByParentId.get("answer")).toEqual(["abandoned", "active"]);
    expect(update.index.entriesById.get("active")).toEqual({
      id: "active",
      type: "message",
      parentId: "answer",
      messageRole: "user",
    });
  });

  it("rejects missing and cyclic parents on the selected path", () => {
    const state = new SessionEntryState();

    expect(() => state.replace([message("leaf", "missing", "assistant", "answer")], "leaf"))
      .toThrow(SessionEntryPathError);
    expect(() => state.replace([
      message("cycle-a", "cycle-b", "user", "a"),
      message("cycle-b", "cycle-a", "assistant", "b"),
    ], "cycle-b")).toThrow(SessionEntryPathError);
  });

  it("accepts only a batch that connects the previous leaf to the reported leaf", () => {
    const state = new SessionEntryState();
    state.replace([
      message("root", null, "user", "start"),
      message("answer", "root", "assistant", "answer"),
    ], "answer");

    const update = state.applyIncrement([
      message("abandoned", "root", "user", "other branch"),
      entry("tool", "answer", "toolResult"),
      message("next", "tool", "user", "continue"),
    ], "next");

    expect(update.kind).toBe("append");
    if (update.kind !== "append") return;
    expect(update.activePathAppend.map((entry) => entry.id)).toEqual(["tool", "next"]);
    expect(update.index.activePath).toEqual(["root", "answer", "tool", "next"]);
    expect(update.index.entriesById.has("abandoned")).toBe(true);
    expect(state.cursor).toBe("next");
  });

  it("requests a complete reload without mutating state when the leaf moves branches", () => {
    const state = new SessionEntryState();
    state.replace([
      message("root", null, "user", "start"),
      message("active", "root", "assistant", "answer"),
    ], "active");

    expect(state.applyIncrement([message("other", "root", "user", "branch")], "other")).toEqual({
      kind: "reload",
      reason: "active-leaf-not-continued",
    });
    expect(state.leafId).toBe("active");
    expect(state.index.entriesById.has("other")).toBe(false);
  });

  it("advances append-order cursor when the active leaf is unchanged", () => {
    const state = new SessionEntryState();
    state.replace([message("root", null, "user", "start")], "root");

    const update = state.applyIncrement([entry("metadata", "root", "model_change")], "root");

    expect(update.kind).toBe("append");
    expect(state.cursor).toBe("metadata");
    expect(state.index.activePath).toEqual(["root"]);
    expect(state.index.entriesById.has("metadata")).toBe(true);
  });

  it("requires a full load before accepting incremental entries", () => {
    const state = new SessionEntryState();

    expect(state.applyIncrement([], null)).toEqual({ kind: "reload", reason: "not-initialized" });
  });
});

function message(
  id: string,
  parentId: string | null,
  role: string,
  content: string,
): RpcSessionEntry {
  return {
    type: "message",
    id,
    parentId,
    message: { role, content },
  };
}

function entry(id: string, parentId: string | null, type: string): RpcSessionEntry {
  return { type, id, parentId };
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

function referenceValidParentId(
  id: string,
  nodes: ReadonlyMap<string, { id: string; parentId: string | null }>,
): string | null {
  const node = nodes.get(id);
  if (!node || node.parentId === null || !nodes.has(node.parentId) || node.parentId === node.id) return null;

  const seen = new Set([node.id]);
  let currentId: string | null = node.parentId;
  while (currentId !== null) {
    if (seen.has(currentId)) return null;
    seen.add(currentId);
    currentId = nodes.get(currentId)?.parentId ?? null;
  }
  return node.parentId;
}
