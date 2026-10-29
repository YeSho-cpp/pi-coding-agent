import { describe, expect, it } from "vitest";

import { reasoningPreview } from "../../src/webview/features/conversation/reasoningPreview";

describe("reasoningPreview", () => {
  it("uses the first non-empty line and strips markdown emphasis", () => {
    expect(reasoningPreview("\n**Checking** the `config`\nmore", false)).toBe("Checking the config");
  });

  it("drops heading and list markers", () => {
    expect(reasoningPreview("## Plan\nstep", false)).toBe("Plan");
    expect(reasoningPreview("- first item\n- second", false)).toBe("first item");
  });

  it("shows the latest finished paragraph while streaming", () => {
    expect(reasoningPreview("alpha\n\nbeta line\nx\n\nunfinished tail", true)).toBe("beta line");
  });

  it("falls back to the only paragraph while streaming", () => {
    expect(reasoningPreview("just started", true)).toBe("just started");
  });

  it("truncates long lines", () => {
    const out = reasoningPreview("x".repeat(300), false);
    expect(out.length).toBe(141);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns empty for blank text", () => {
    expect(reasoningPreview("  \n \n", false)).toBe("");
  });
});
