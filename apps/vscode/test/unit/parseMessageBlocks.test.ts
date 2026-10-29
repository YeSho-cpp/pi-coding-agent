import { describe, expect, it } from "vitest";

import { parseMessageBlocks } from "../../src/webview/features/conversation/markdown/parseMessageBlocks.js";

describe("parseMessageBlocks", () => {
  it("keeps plain markdown as a single segment", () => {
    expect(parseMessageBlocks("hello **world**")).toEqual([
      { type: "markdown", text: "hello **world**" },
    ]);
  });

  it("extracts a complete mermaid fence", () => {
    const input = ["before", "```mermaid", "graph TD", "  A-->B", "```", "after"].join("\n");
    expect(parseMessageBlocks(input)).toEqual([
      { type: "markdown", text: "before" },
      { type: "mermaid", text: "graph TD\n  A-->B" },
      { type: "markdown", text: "after" },
    ]);
  });

  it("leaves incomplete mermaid fences in markdown for streaming", () => {
    const input = ["intro", "```mermaid", "graph TD", "  A-->B"].join("\n");
    expect(parseMessageBlocks(input)).toEqual([
      { type: "markdown", text: "intro\n```mermaid\ngraph TD\n  A-->B" },
    ]);
  });

  it("does not treat non-mermaid fences as diagrams", () => {
    const input = ["```ts", "const x = 1", "```"].join("\n");
    expect(parseMessageBlocks(input)).toEqual([
      { type: "markdown", text: input },
    ]);
  });

  it("supports tilde mermaid fences", () => {
    const input = ["~~~mermaid", "flowchart LR", "  A-->B", "~~~"].join("\n");
    expect(parseMessageBlocks(input)).toEqual([
      { type: "mermaid", text: "flowchart LR\n  A-->B" },
    ]);
  });

  it("extracts complete html and svg fences as preview segments", () => {
    const input = [
      "before",
      "```html",
      "<div class=\"card\">hi</div>",
      "```",
      "```svg",
      "<svg viewBox=\"0 0 10 10\"><circle r=\"4\"/></svg>",
      "```",
      "after",
    ].join("\n");
    expect(parseMessageBlocks(input)).toEqual([
      { type: "markdown", text: "before" },
      { type: "html", text: "<div class=\"card\">hi</div>" },
      { type: "svg", text: "<svg viewBox=\"0 0 10 10\"><circle r=\"4\"/></svg>" },
      { type: "markdown", text: "after" },
    ]);
  });

  it("leaves incomplete html fences in markdown for streaming", () => {
    const input = ["intro", "```html", "<div>open"].join("\n");
    expect(parseMessageBlocks(input)).toEqual([
      { type: "markdown", text: "intro\n```html\n<div>open" },
    ]);
  });

  it("ignores info strings after the preview language token", () => {
    const input = ["```html title=\"demo\"", "<p>x</p>", "```"].join("\n");
    expect(parseMessageBlocks(input)).toEqual([
      { type: "html", text: "<p>x</p>" },
    ]);
  });
});
