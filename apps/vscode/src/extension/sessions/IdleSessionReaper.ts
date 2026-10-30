import type { SessionViewModel } from "../../shared/model/sessionViewModel.js";

export interface ReapCandidate {
  id: string;
  /** Epoch milliseconds of the session's last event, or of the last sweep that found it in use. */
  lastActiveAt: number;
}

export interface IdleSessionReaperOptions {
  /** How long a session may sit idle before it is stopped; 0 or less keeps every session running. */
  idleMs(): number;
  /** Sessions that are running a Pi process and are neither selected, displayed, nor busy. */
  candidates(): Iterable<ReapCandidate>;
  stop(sessionId: string): Promise<void>;
  now?(): number;
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Every session the user ever starts keeps its own Pi process, and each Pi process keeps its own
 * MCP servers. Stopping the ones nobody is looking at bounds that; selecting one or sending it a
 * prompt starts it again from its session file.
 */
export class IdleSessionReaper {
  readonly #options: IdleSessionReaperOptions;
  #timer: ReturnType<typeof setInterval> | null = null;
  #sweeping = false;
  #disposed = false;

  constructor(options: IdleSessionReaperOptions) {
    this.#options = options;
  }

  /** Arms the periodic sweep once; there is nothing to reap until a session has started. */
  ensureRunning(): void {
    if (this.#timer || this.#disposed) return;
    this.#timer = setInterval(() => void this.sweep(), this.#options.intervalMs ?? DEFAULT_INTERVAL_MS);
    this.#timer.unref();
  }

  async sweep(): Promise<string[]> {
    const idleMs = this.#options.idleMs();
    if (idleMs <= 0 || this.#sweeping || this.#disposed) return [];
    this.#sweeping = true;
    const stopped: string[] = [];
    try {
      const now = (this.#options.now ?? Date.now)();
      for (const candidate of [...this.#options.candidates()]) {
        if (this.#disposed) break;
        if (now - candidate.lastActiveAt < idleMs) continue;
        try {
          await this.#options.stop(candidate.id);
          stopped.push(candidate.id);
        } catch {
          // A stop that fails leaves the session as it was; the next sweep tries again.
        }
      }
    } finally {
      this.#sweeping = false;
    }
    return stopped;
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}

/** True while nothing is running, waiting on the user, queued, or being restructured in the session. */
export function isIdleSession(view: SessionViewModel): boolean {
  return view.status === "ready"
    && !view.isStreaming
    && !view.isCompacting
    && !view.isForking
    && !view.isNavigatingTree
    && !view.isSummarizingTree
    && view.pendingExtensionUi.length === 0
    && view.queuedSteers.length === 0
    && view.queuedFollowUps.length === 0;
}
