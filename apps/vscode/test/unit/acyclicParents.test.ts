import { describe, expect, it } from "vitest";

import { acyclicParents, type ParentLinked } from "../../src/extension/sessions/acyclicParents.js";

function graph(links: Record<string, string | null>): Map<string, ParentLinked> {
  return new Map(Object.entries(links).map(([id, parentId]) => [id, { id, parentId }]));
}

function resolve(links: Record<string, string | null>): Record<string, string | null> {
  return Object.fromEntries(acyclicParents(graph(links)));
}

describe("acyclicParents", () => {
  it("keeps a linear chain", () => {
    expect(resolve({ a: null, b: "a", c: "b" })).toEqual({ a: null, b: "a", c: "b" });
  });

  it("keeps forks", () => {
    expect(resolve({ a: null, b: "a", c: "a", d: "c" })).toEqual({ a: null, b: "a", c: "a", d: "c" });
  });

  it("nulls an orphan whose parent is missing but keeps nodes above it", () => {
    expect(resolve({ orphan: "gone", child: "orphan", grandchild: "child" })).toEqual({
      orphan: null,
      child: "orphan",
      grandchild: "child",
    });
  });

  it("nulls a self parent and all its descendants", () => {
    expect(resolve({ a: "a", b: "a", c: "b", free: null })).toEqual({ a: null, b: null, c: null, free: null });
  });

  it("nulls both nodes of a 2-cycle", () => {
    expect(resolve({ a: "b", b: "a" })).toEqual({ a: null, b: null });
  });

  it("nulls nodes hanging below a cycle", () => {
    expect(resolve({ a: "b", b: "c", c: "a", t1: "a", t2: "t1", ok: null, okChild: "ok" })).toEqual({
      a: null,
      b: null,
      c: null,
      t1: null,
      t2: null,
      ok: null,
      okChild: "ok",
    });
  });

  it("resolves a 20000-node linear chain quickly", () => {
    const size = 20000;
    const nodes = new Map<string, ParentLinked>();
    for (let i = 0; i < size; i++) nodes.set(`n${i}`, { id: `n${i}`, parentId: i === 0 ? null : `n${i - 1}` });

    const started = performance.now();
    const parents = acyclicParents(nodes);
    const elapsed = performance.now() - started;

    expect(parents.size).toBe(size);
    expect(parents.get("n0")).toBeNull();
    expect(parents.get(`n${size - 1}`)).toBe(`n${size - 2}`);
    expect([...parents].every(([id, parent]) => parent === (id === "n0" ? null : `n${Number(id.slice(1)) - 1}`))).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });
});
