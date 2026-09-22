// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyFindHighlights,
  clearFindHighlights,
  collectFindRanges,
  findPosition,
  isFindShortcut,
} from "../../src/webview/features/conversation/find/findInConversation.js";

/**
 * The finder walks rendered text, so these assert on DOM text nodes rather than on store text:
 * what is matched must be what is on screen.
 */

function containerWith(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  return container;
}

function matchedTexts(container: HTMLElement, query: string): string[] {
  return collectFindRanges(container, query).map((range) => range.toString());
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("collectFindRanges", () => {
  it("matches case-insensitively and returns the original substring each match covers", () => {
    const container = containerWith("<p>Buffer vs recv buffer</p><p>BUFFERS again</p>");

    // Ranges span the needle's length in the original text, whatever the casing was.
    expect(matchedTexts(container, "buffer")).toEqual(["Buffer", "buffer", "BUFFER"]);
    expect(matchedTexts(container, "BUFFER")).toEqual(["Buffer", "buffer", "BUFFER"]);
    expect(matchedTexts(container, "buffers")).toEqual(["BUFFERS"]);
    expect(matchedTexts(container, "recv bu")).toEqual(["recv bu"]);
  });

  it("keeps several matches that share one text node separate", () => {
    const container = containerWith("<p>a-b-a-b</p>");

    expect(matchedTexts(container, "a")).toEqual(["a", "a"]);
    expect(matchedTexts(container, "-")).toEqual(["-", "-", "-"]);
  });

  it("ignores hidden subtrees, which is where collapsed tools and folded turns live", () => {
    const container = containerWith(
      "<p>visible tile</p><div hidden><p>hidden tile</p></div><p aria-hidden='true'>still painted</p>",
    );

    expect(matchedTexts(container, "tile")).toEqual(["tile"]);
    // Painted-but-aria-hidden text is still on screen, so find sees it — like the browser's own find.
    expect(matchedTexts(container, "painted")).toEqual(["painted"]);
  });

  it("asks for nothing when the query is empty or absent", () => {
    const container = containerWith("<p>anything at all</p>");

    expect(collectFindRanges(container, "")).toEqual([]);
    expect(collectFindRanges(container, "zzz-nope")).toEqual([]);
  });

  it("searches rendered text, including code and tool output", () => {
    const container = containerWith("<pre><code>ncclReduceScatter()</code></pre><span>called once</span>");

    expect(matchedTexts(container, "ncclreduce")).toEqual(["ncclReduce"]);
    expect(matchedTexts(container, "called")).toEqual(["called"]);
  });
});

describe("applyFindHighlights / clearFindHighlights", () => {
  it("degrades quietly where the CSS Custom Highlight API is unavailable", () => {
    const container = containerWith("<p>tile</p>");
    const ranges = collectFindRanges(container, "tile");

    // jsdom has no CSS.highlights; the finder must still be usable for navigation.
    expect(applyFindHighlights(ranges, 0)).toBe(false);
    expect(() => clearFindHighlights()).not.toThrow();
    expect(() => applyFindHighlights([], -1)).not.toThrow();
  });
});

describe("findPosition", () => {
  it("reports a 1-based position and nothing when there is no active match", () => {
    expect(findPosition(0, 3)).toBe(1);
    expect(findPosition(2, 3)).toBe(3);
    expect(findPosition(-1, 3)).toBe(0);
    expect(findPosition(0, 0)).toBe(0);
    expect(findPosition(5, 3)).toBe(0);
  });
});

describe("isFindShortcut", () => {
  const key = (overrides: Partial<KeyboardEvent> = {}): KeyboardEvent =>
    ({ key: "f", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...overrides }) as KeyboardEvent;

  it("claims Ctrl+F and Cmd+F, including an uppercase F from Caps Lock", () => {
    expect(isFindShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isFindShortcut(key({ metaKey: true }))).toBe(true);
    expect(isFindShortcut(key({ key: "F", metaKey: true }))).toBe(true);
    expect(isFindShortcut(key({ key: "F" }))).toBe(false);
  });

  it("leaves every other combo alone", () => {
    expect(isFindShortcut(key())).toBe(false);
    expect(isFindShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isFindShortcut(key({ metaKey: true, altKey: true }))).toBe(false);
    expect(isFindShortcut(key({ ctrlKey: true, key: "g" }))).toBe(false);
  });
});
