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
  key: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve(html: string | null): void;
}

const REQUEST_TIMEOUT_MS = 15_000;
/** A streaming answer re-renders its fences many times a second; finished fences repaint from here. */
const CACHE_ENTRIES = 96;
const CACHE_MAX_CODE_CHARS = 20_000;

const pending = new Map<string, PendingRequest>();
const inFlight = new Map<string, Promise<string | null>>();
const resolved = new Map<string, string>();

function cacheKey(lang: string, code: string): string {
  return lang + " " + code;
}

/** The host's tokenized HTML for a fence it already answered, or null. */
export function cachedHighlight(lang: string, code: string): string | null {
  const key = cacheKey(lang, code);
  const html = resolved.get(key);
  if (html === undefined) return null;
  resolved.delete(key);
  resolved.set(key, html);
  return html;
}

function remember(key: string, html: string): void {
  resolved.delete(key);
  resolved.set(key, html);
  if (resolved.size > CACHE_ENTRIES) resolved.delete(resolved.keys().next().value!);
}

export function requestHighlightedCode(lang: string, code: string): Promise<string | null> {
  const key = cacheKey(lang, code);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const requestId = createId("highlight");
  const request = new Promise<string | null>((resolve) => {
    const timeout = setTimeout(() => {
      if (pending.delete(requestId)) resolve(null);
    }, REQUEST_TIMEOUT_MS);
    pending.set(requestId, { key, timeout, resolve });
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
  if (html && entry.key.length <= CACHE_MAX_CODE_CHARS + 32) remember(entry.key, html);
  entry.resolve(html);
}
