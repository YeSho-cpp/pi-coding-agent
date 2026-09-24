import { postToHost } from "../../../bridge/vscodeBridge";
import { createId } from "../../../utils/createId";

/**
 * Asks the host to tokenize a code fence with the user's own VS Code grammars.
 *
 * The synchronous highlight.js pass in renderMarkdown has already painted the block by the time
 * this runs; a null here (unknown language, grammar missing, engine failure) simply leaves that
 * first paint in place.
 */

interface PendingRequest {
  timeout: ReturnType<typeof setTimeout>;
  resolve(html: string | null): void;
}

const REQUEST_TIMEOUT_MS = 15_000;

const pending = new Map<string, PendingRequest>();
const inFlight = new Map<string, Promise<string | null>>();

export function requestHighlightedCode(lang: string, code: string): Promise<string | null> {
  const key = lang + " " + code;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const requestId = createId("highlight");
  const request = new Promise<string | null>((resolve) => {
    const timeout = setTimeout(() => {
      if (pending.delete(requestId)) resolve(null);
    }, REQUEST_TIMEOUT_MS);
    pending.set(requestId, { timeout, resolve });
    postToHost({ type: "highlightCode", requestId, lang, code });
  }).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}

export function deliverHighlightedCode(requestId: string, html: string | null): void {
  const entry = pending.get(requestId);
  if (!entry) return;
  pending.delete(requestId);
  clearTimeout(entry.timeout);
  entry.resolve(html);
}
