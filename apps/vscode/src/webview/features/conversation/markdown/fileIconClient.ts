import { postToHost } from "../../../bridge/vscodeBridge";
import { createId } from "../../../utils/createId";

/**
 * Asks the host for the active icon-theme artwork of a file chip (the same
 * `fileIconDataUri` the composer chips use). A null here — name not in the
 * theme, unreadable artwork — simply leaves the chip text-only.
 */

interface PendingRequest {
  timeout: ReturnType<typeof setTimeout>;
  resolve(dataUri: string | null): void;
}

const REQUEST_TIMEOUT_MS = 10_000;

const pending = new Map<string, PendingRequest>();
const inFlight = new Map<string, Promise<string | null>>();
const resolved = new Map<string, string | null>();

export function requestFileIcon(path: string): Promise<string | null> {
  const cached = resolved.get(path);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = inFlight.get(path);
  if (existing) return existing;

  const requestId = createId("fileIcon");
  const request = new Promise<string | null>((resolve) => {
    const timeout = setTimeout(() => {
      if (pending.delete(requestId)) resolve(null);
    }, REQUEST_TIMEOUT_MS);
    pending.set(requestId, { timeout, resolve });
    postToHost({ type: "fileIcon", requestId, path });
  }).finally(() => {
    inFlight.delete(path);
  });
  // Cache misses too: resolution is deterministic for a theme, and streaming
  // re-renders would otherwise re-ask for the same artwork every frame.
  void request.then((dataUri) => resolved.set(path, dataUri));
  inFlight.set(path, request);
  return request;
}

export function deliverFileIcon(requestId: string, dataUri: string | null): void {
  const entry = pending.get(requestId);
  if (!entry) return;
  pending.delete(requestId);
  clearTimeout(entry.timeout);
  entry.resolve(dataUri);
}
