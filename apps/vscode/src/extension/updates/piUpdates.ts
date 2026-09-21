import { get } from "node:https";
import { execFile } from "node:child_process";

import type { PiInvocation } from "@frostime/pi-rpc";

/**
 * Pi publishes its latest release at a first-party endpoint rather than the npm registry,
 * so the response can also point at a different package name or carry a note. Pi's own CLI
 * checks the same URL (dist/utils/version-check.js) — this mirrors it for the RPC mode,
 * where the CLI never runs its check.
 */
export const LATEST_PI_VERSION_URL = "https://pi.dev/api/latest-version";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export interface LatestPiRelease {
  version: string;
  packageName?: string;
  note?: string;
}

/**
 * "unknown" is not the same as "current": the first means the check did not complete (offline,
 * proxy, blocked) and should be retried on the next activation, while the second is a real answer.
 * Collapsing them would let one failed request silence the check for a whole day.
 */
export type PiUpdateCheck =
  | { status: "newer"; release: LatestPiRelease }
  | { status: "current" }
  | { status: "unknown" };

/** `pi --version` prints a bare version; keep the parse tolerant like the fd probe. */
export function parsePiVersion(output: string): string | undefined {
  const match = output.match(/\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/);
  return match?.[0];
}

interface ParsedVersion {
  core: [number, number, number];
  prerelease: string[];
}

function parsePackageVersion(value: string): ParsedVersion | undefined {
  const trimmed = value.trim().replace(/^v/, "");
  const match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return undefined;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

/** Mirrors semver precedence: numerics beat alphanumerics, and a release outranks its prereleases. */
function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return right.length - left.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return Number(a) - Number(b);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

/** Returns undefined when either side is not a version, matching the CLI's fallback behaviour. */
export function comparePackageVersions(left: string, right: string): number | undefined {
  const a = parsePackageVersion(left);
  const b = parsePackageVersion(right);
  if (!a || !b) return undefined;
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index]! - b.core[index]!;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

export function isNewerPackageVersion(candidate: string, current: string): boolean {
  const comparison = comparePackageVersions(candidate, current);
  if (comparison !== undefined) return comparison > 0;
  return candidate.trim() !== current.trim();
}

export function extractLatestRelease(payload: unknown): LatestPiRelease | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const record = payload as Record<string, unknown>;
  if (typeof record.version !== "string" || !record.version.trim()) return undefined;
  const packageName = typeof record.packageName === "string" ? record.packageName.trim() : "";
  const note = typeof record.note === "string" ? record.note.trim() : "";
  return {
    version: record.version.trim(),
    ...(packageName ? { packageName } : {}),
    ...(note ? { note } : {}),
  };
}

/**
 * Pi's own gates. They are read from the extension host environment, so a GUI-launched VS Code
 * only sees them when they were exported before launch — best effort, but it keeps the two
 * processes consistent whenever the shell did export them.
 */
export function isVersionCheckSuppressed(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.PI_OFFLINE || env.PI_SKIP_VERSION_CHECK);
}

export interface FetchLatestOptions {
  timeoutMs?: number;
  userAgent?: string;
  requestJson?: (url: string, timeoutMs: number, userAgent: string) => Promise<unknown>;
}

export async function checkForPiUpdate(
  currentVersion: string,
  options: FetchLatestOptions = {},
): Promise<PiUpdateCheck> {
  const request = options.requestJson ?? requestJsonOverHttps;
  try {
    const payload = await request(
      LATEST_PI_VERSION_URL,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      options.userAgent ?? `pi-vscode/${currentVersion}`,
    );
    const release = extractLatestRelease(payload);
    if (!release) return { status: "unknown" };
    return isNewerPackageVersion(release.version, currentVersion)
      ? { status: "newer", release }
      : { status: "current" };
  } catch {
    // Offline, proxied or blocked: stay quiet, exactly like the CLI's own check.
    return { status: "unknown" };
  }
}

export interface UpdateCheckStamp {
  at: number;
  by?: string;
}

/**
 * Whether enough time has passed to check again.
 *
 * The stamp records which extension version wrote it, and a stamp from another version counts as
 * due, so installing a new build re-checks immediately instead of inheriting the previous build's
 * window. A bare number is a stamp written before the stamp carried a version: the older code
 * recorded the interval even when its request never completed, which silenced the check for a full
 * day, so those are treated as due and get replaced by the current shape on the next completed run.
 */
export function isUpdateCheckDue(
  stamp: UpdateCheckStamp | number | undefined,
  options: { now: number; extensionVersion: string; intervalMs: number },
): boolean {
  if (stamp === undefined) return true;
  if (typeof stamp === "number") return true;
  if (stamp.by !== options.extensionVersion) return true;
  return options.now - stamp.at >= options.intervalMs;
}

/**
 * Decides whether an update is worth advertising. Kept pure so the three inputs that drive the
 * status bar (known release, installed version, user's skip list) can be tested directly.
 */
export function shouldAdvertisePiUpdate(
  available: string | undefined,
  current: string,
  ignored: readonly string[] = [],
): boolean {
  if (!available) return false;
  if (ignored.includes(available)) return false;
  return isNewerPackageVersion(available, current);
}

function requestJsonOverHttps(url: string, timeoutMs: number, userAgent: string): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = get(url, { headers: { accept: "application/json", "user-agent": userAgent } }, (response) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        response.resume();
        rejectPromise(new Error(`HTTP ${status}`));
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > MAX_RESPONSE_BYTES) {
          request.destroy();
          rejectPromise(new Error("response too large"));
        }
      });
      response.on("end", () => {
        try {
          resolvePromise(JSON.parse(body));
        } catch (error) {
          rejectPromise(error instanceof Error ? error : new Error("invalid JSON response"));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("timed out")));
    request.on("error", rejectPromise);
  });
}

export type PiVersionProbe = (invocation: PiInvocation) => Promise<string | undefined>;

/** Default probe: run the resolved Pi entry point's own `--version`. */
export const probePiVersion: PiVersionProbe = (invocation) =>
  new Promise((resolvePromise) => {
    execFile(
      invocation.command,
      [...invocation.args, "--version"],
      { encoding: "utf8", windowsHide: true, timeout: 15_000 },
      (error, stdout) => {
        if (error) {
          resolvePromise(undefined);
          return;
        }
        resolvePromise(parsePiVersion(stdout));
      },
    );
  });

/** `pi update` with no target updates Pi itself; `--force` reinstalls when already current. */
export function buildPiUpdateArguments(invocation: PiInvocation, force = false): string[] {
  return [...invocation.args, "update", ...(force ? ["--force"] : [])];
}

export function buildPiUpdateCommandLine(invocation: PiInvocation): string {
  return [invocation.command, ...buildPiUpdateArguments(invocation)].join(" ");
}
