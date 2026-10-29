/** Closer to the end than this still counts as reading the tail. */
const TAIL_SLACK_PX = 24;

/**
 * Keeps a scrollable block on its newest line while it fills with streamed text, until the
 * reader scrolls up to read something. Scrolling back to the end resumes following.
 *
 * Content is observed rather than passed in: markdown and highlighted code settle after the
 * state that produced them, and a block that was hidden when its text arrived has no size
 * until it opens.
 */
export function stickToEnd(node: HTMLElement, enabled: boolean): { update(next: boolean): void; destroy(): void } {
  let following = enabled;
  let atTail = true;

  const follow = (): void => {
    if (following && atTail) node.scrollTop = node.scrollHeight;
  };
  const onScroll = (): void => {
    atTail = node.scrollHeight - node.scrollTop - node.clientHeight <= TAIL_SLACK_PX;
  };

  node.addEventListener("scroll", onScroll, { passive: true });
  const content = new MutationObserver(follow);
  content.observe(node, { childList: true, subtree: true, characterData: true });
  const size = new ResizeObserver(follow);
  size.observe(node);
  follow();

  return {
    update(next) {
      following = next;
      if (next) atTail = true;
      follow();
    },
    destroy() {
      node.removeEventListener("scroll", onScroll);
      content.disconnect();
      size.disconnect();
    },
  };
}
