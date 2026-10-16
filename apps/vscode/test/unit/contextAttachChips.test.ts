import { get } from "svelte/store";
import { beforeEach, describe, expect, it } from "vitest";

import type { ContextAttachItemView } from "../../src/shared/model/contextAttachModel";
import {
  addContextChips,
  clearContextChips,
  contextAttachChips,
} from "../../src/webview/features/composer/contextAttachStore.svelte";

function chip(id: string): ContextAttachItemView {
  return {
    id,
    kind: "file",
    path: `/repo/${id}.go`,
    label: `${id}.go`,
    insertText: `\`/repo/${id}.go\``,
  };
}

describe("clearContextChips", () => {
  beforeEach(() => {
    clearContextChips("session-1");
  });

  it("empties the session list and the __pending__ mirror QuickPick attaches write to", () => {
    addContextChips("session-1", [chip("a")]);
    addContextChips("__pending__", [chip("a"), chip("b")]);

    clearContextChips("session-1");

    const map = get(contextAttachChips);
    expect(map["session-1"] ?? []).toEqual([]);
    // chipsForComposer renders sessionId ∪ __pending__; a surviving mirror is what made
    // Clear look like a no-op after a QuickPick attach.
    expect(map["__pending__"] ?? []).toEqual([]);
  });

  it("also empties mirrors written into other session keys", () => {
    addContextChips("session-1", [chip("a")]);
    addContextChips("older-session", [chip("a")]);

    clearContextChips("session-1");

    expect(get(contextAttachChips)["older-session"] ?? []).toEqual([]);
  });
});
