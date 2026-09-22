/**
 * Find-in-conversation over the rendered message DOM.
 *
 * Matching walks the visible text nodes rather than the store's source text, so what is searched
 * is exactly what the reader can see — collapsed tool output and folded turns carry `hidden` and
 * are skipped rather than matched invisibly.
 *
 * Painting uses the CSS Custom Highlight API: ranges are registered against the document without
 * touching the DOM, which matters because Svelte re-renders the message tree on every stream
 * update and a DOM-mutating highlighter would be wiped (or worse, fight) that render.
 */

const HIGHLIGHT_ALL = "conversation-find";
const HIGHLIGHT_ACTIVE = "conversation-find-active";

interface HighlightRegistry {
  set(key: string, value: unknown): void;
  delete(key: string): boolean;
}

/**
 * Typed accessors rather than DOM lib types: the API exists in Chromium but not in every host
 * (jsdom, older Electron), and the finder must work there for navigation even without painting.
 */
function highlightRegistry(): HighlightRegistry | undefined {
  const css = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const registry = css?.highlights;
  return registry && typeof registry.set === "function" && typeof registry.delete === "function"
    ? registry
    : undefined;
}

function HighlightConstructor(): (new (...ranges: Range[]) => unknown) | undefined {
  return (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
}

/** Collapsed turns and tools are `hidden`; their text is in the DOM but not on screen. */
function isHidden(node: Node, root: HTMLElement): boolean {
  const start = node instanceof Element ? node : node.parentElement;
  for (let element: Element | null = start; element; element = element.parentElement) {
    if (element.hasAttribute("hidden")) return true;
    if (element === root) break;
  }
  return false;
}

/** Case-insensitive ranges for every occurrence of `query`, in document order. */
export function collectFindRanges(container: HTMLElement, query: string): Range[] {
  if (!container || !query) return [];
  const needle = query.toLowerCase();
  const ranges: Range[] = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || node.nodeValue.length === 0) return NodeFilter.FILTER_REJECT;
      if (isHidden(node, container)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    const haystack = text.toLowerCase();
    let from = 0;
    for (;;) {
      const index = haystack.indexOf(needle, from);
      if (index === -1) break;
      const end = Math.min(index + needle.length, text.length);
      if (end <= index) break;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, end);
      ranges.push(range);
      from = Math.max(index + needle.length, index + 1);
    }
  }
  return ranges;
}

/** Paints every match, plus the current one distinctly. Returns false when unsupported. */
export function applyFindHighlights(ranges: readonly Range[], activeIndex: number): boolean {
  const registry = highlightRegistry();
  const HighlightClass = HighlightConstructor();
  if (!registry || !HighlightClass) return false;
  registry.delete(HIGHLIGHT_ALL);
  registry.delete(HIGHLIGHT_ACTIVE);
  if (ranges.length === 0) return true;
  registry.set(HIGHLIGHT_ALL, new HighlightClass(...ranges));
  const active = ranges[activeIndex];
  if (active) registry.set(HIGHLIGHT_ACTIVE, new HighlightClass(active));
  return true;
}

export function clearFindHighlights(): void {
  const registry = highlightRegistry();
  registry?.delete(HIGHLIGHT_ALL);
  registry?.delete(HIGHLIGHT_ACTIVE);
}

/** Brings a match into view without disturbing the reader's horizontal position. */
export function revealFindRange(range: Range): void {
  const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  // Optional call: jsdom (and any host without layout) has no scrollIntoView, and a missing
  // scroll must not take the find widget down with it.
  element?.scrollIntoView?.({ block: "center", behavior: "smooth" });
}

/** 1-based position of the active match for display; 0 when there is nothing to show. */
export function findPosition(activeIndex: number, total: number): number {
  if (total <= 0 || activeIndex < 0 || activeIndex >= total) return 0;
  return activeIndex + 1;
}

/**
 * Whether a keydown is the find shortcut (Ctrl/Cmd+F, no modifiers beyond Ctrl/Cmd).
 *
 * The conversation claims this key in the capture phase, before VS Code's own webview shell can
 * forward it to the workbench — see ConversationView, where that forwarding is what opens the
 * editor's find widget alongside this one.
 */
export function isFindShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): boolean {
  if (event.key.toLowerCase() !== "f") return false;
  if (!event.ctrlKey && !event.metaKey) return false;
  return !event.altKey && !event.shiftKey;
}
