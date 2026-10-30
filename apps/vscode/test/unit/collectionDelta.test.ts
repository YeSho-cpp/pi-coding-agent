import { describe, expect, it } from "vitest";

import { collectionDelta } from "../../src/extension/webview-host/collectionDelta.js";
import type { AgentTurnItemView, AgentTurnView, ConversationMessageView } from "../../src/shared/model/conversationModel.js";
import { mergeCollection } from "../../src/webview/bridge/applyHostMessage.js";

describe("incremental Webview collections", () => {
  it("transmits only appended or replaced objects while preserving order", () => {
    const first = { id: "a", value: 1 };
    const changed = { id: "a", value: 2 };
    const appended = { id: "b", value: 3 };
    const delta = collectionDelta(["a"], new Map([["a", first]]), [changed, appended]);
    expect(delta).toEqual({ mode: "upsert", items: [changed, appended] });
    expect(mergeCollection([first], delta)).toEqual([changed, appended]);
  });

  it("replaces the collection when items are removed or reordered", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    expect(collectionDelta(["a", "b"], new Map([["a", a], ["b", b]]), [b, a])).toEqual({ mode: "replace", items: [b, a] });
  });
});

describe("turn patches", () => {
  const screenshot = { type: "images" as const, images: [{ id: "i1", name: "shot.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA", size: 4 }] };
  const user: ConversationMessageView = { id: "u1", role: "user", status: "complete", timestamp: 1, blocks: [screenshot] };

  function turn(items: AgentTurnItemView[], extra: { status?: AgentTurnView["status"]; endedAt?: number } = {}): AgentTurnView {
    return {
      id: "turn-1",
      type: "turn",
      status: extra.status ?? "running",
      startedAt: 1,
      userMessage: user,
      items,
      ...(extra.endedAt === undefined ? {} : { endedAt: extra.endedAt }),
    };
  }
  function response(id: string, text: string): AgentTurnItemView {
    return { id, type: "response", status: "streaming", timestamp: 1, blocks: [{ type: "text", text }] };
  }
  function tool(id: string, output: string): AgentTurnItemView {
    return {
      id,
      type: "tool",
      timestamp: 1,
      tool: { state: "bound", id: `call-${id}`, name: "bash", label: "ls", args: {}, status: "complete", isError: false, startedAt: 1, output },
    };
  }
  function send(previous: AgentTurnView, current: AgentTurnView) {
    return collectionDelta([previous.id], new Map([[previous.id, previous]]), [current]);
  }

  it("does not resend the user message or the activities that did not change while a response streams", () => {
    const output = tool("t1", "x".repeat(50_000));
    const before = turn([output, response("r1", "Hel")]);
    const after = turn([output, response("r1", "Hello")]);

    const delta = send(before, after);

    expect(delta.items).toEqual([]);
    expect(delta.turnPatches).toEqual([{ id: "turn-1", fields: {}, items: [after.items[1]] }]);
    expect(JSON.stringify(delta)).not.toContain("data:image");
    expect(JSON.stringify(delta)).not.toContain("xxxxxxxx");
  });

  it("appends new activities without restating the order", () => {
    const first = response("r1", "a");
    const before = turn([first]);
    const after = turn([first, tool("t1", "ok")], { status: "completed", endedAt: 9 });

    const delta = send(before, after);

    expect(delta.turnPatches).toEqual([{ id: "turn-1", fields: { status: "completed", endedAt: 9 }, items: [after.items[1]] }]);
  });

  it("states the order when an activity was removed or moved", () => {
    const a = response("r1", "a");
    const b = tool("t1", "ok");
    expect(send(turn([a, b]), turn([b])).turnPatches?.[0]?.order).toEqual(["t1"]);
    expect(send(turn([a, b]), turn([b, a])).turnPatches?.[0]?.order).toEqual(["t1", "r1"]);
  });

  it("sends the whole turn when a field was dropped, since a patch cannot remove one", () => {
    const bare: AgentTurnView = { id: "turn-1", type: "turn", status: "running", startedAt: 1, items: [response("r1", "a")] };
    const delta = send(turn([response("r1", "a")]), bare);

    expect(delta.turnPatches).toBeUndefined();
    expect(delta.items).toEqual([bare]);
  });

  it("sends nothing for a turn that was rebuilt without any change, so the Webview keeps its object", () => {
    const first = response("r1", "a");
    const delta = send(turn([first]), turn([first]));

    expect(delta).toEqual({ mode: "upsert", items: [] });
  });

  it("sends a turn the Webview has not held yet whole", () => {
    const fresh = turn([response("r1", "a")]);

    expect(collectionDelta([], new Map(), [fresh])).toEqual({ mode: "upsert", items: [fresh] });
  });

  it("rebuilds exactly the sent turn from any edit, keeping every untouched activity the same object", () => {
    let seed = 12345;
    const random = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % n;
    };
    for (let round = 0; round < 300; round += 1) {
      let held = turn(Array.from({ length: random(5) }, (_, index) => response(`r${index}`, "t")));
      let current = held;
      for (let step = 0; step < 6; step += 1) {
        const items = [...current.items];
        switch (random(6)) {
          case 0: items.push(tool(`n${round}-${step}`, "o")); break;
          case 1: if (items.length > 0) items[random(items.length)] = response(`r${random(5)}`, `v${step}`); break;
          case 2: if (items.length > 0) items.splice(random(items.length), 1); break;
          case 3: if (items.length > 1) items.reverse(); break;
          case 4: current = { ...current, status: "completed", endedAt: step + 2 }; break;
          default: current = { ...current, userMessage: { ...user, id: `u${step}` } };
        }
        const unique = new Map(items.map((item) => [item.id, item]));
        current = { ...current, items: [...unique.values()] };

        const delta = collectionDelta([held.id], new Map([[held.id, held]]), [current]);
        const merged = mergeCollection<AgentTurnView>([held], delta);

        expect(merged).toEqual([current]);
        for (const item of merged[0]!.items) {
          const heldItem = held.items.find((candidate) => candidate.id === item.id);
          if (heldItem && current.items.includes(heldItem)) expect(item).toBe(heldItem);
        }
        held = merged[0]!;
      }
    }
  });

  it("reports a patch for a turn the Webview does not hold, so the caller can ask for a snapshot", () => {
    let reported = 0;
    const merged = mergeCollection<AgentTurnView>([], {
      mode: "upsert",
      items: [],
      turnPatches: [{ id: "turn-1", fields: {}, items: [] }],
    }, () => { reported += 1; });

    expect(merged).toEqual([]);
    expect(reported).toBe(1);
  });

  it("reports a patch whose order names an activity the Webview never received", () => {
    let reported = 0;
    const held = turn([response("r1", "a")]);

    mergeCollection<AgentTurnView>([held], {
      mode: "upsert",
      items: [],
      turnPatches: [{ id: "turn-1", fields: {}, items: [], order: ["r1", "missing"] }],
    }, () => { reported += 1; });

    expect(reported).toBe(1);
  });
});
