import { describe, expect, it } from "vitest";

import {
  buildPiUpdateArguments,
  buildPiUpdateCommandLine,
  checkForPiUpdate,
  comparePackageVersions,
  extractLatestRelease,
  isNewerPackageVersion,
  isUpdateCheckDue,
  isVersionCheckSuppressed,
  parsePiVersion,
  shouldAdvertisePiUpdate,
} from "../../src/extension/updates/piUpdates.js";

describe("parsePiVersion", () => {
  it("reads the bare version pi prints", () => {
    expect(parsePiVersion("0.85.1")).toBe("0.85.1");
    expect(parsePiVersion("pi 0.85.1\n")).toBe("0.85.1");
    expect(parsePiVersion("0.86.0-rc.1")).toBe("0.86.0-rc.1");
  });

  it("returns undefined when no version is present", () => {
    expect(parsePiVersion("command not found")).toBeUndefined();
    expect(parsePiVersion("")).toBeUndefined();
  });
});

describe("comparePackageVersions", () => {
  it("orders by numeric core", () => {
    expect(comparePackageVersions("0.86.1", "0.85.1")).toBeGreaterThan(0);
    expect(comparePackageVersions("0.85.1", "0.85.1")).toBe(0);
    expect(comparePackageVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
  });

  it("ranks a release above its prereleases and orders prerelease identifiers", () => {
    expect(comparePackageVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
    expect(comparePackageVersions("1.0.0-rc.2", "1.0.0-rc.1")).toBeGreaterThan(0);
    expect(comparePackageVersions("1.0.0-rc.10", "1.0.0-rc.9")).toBeGreaterThan(0);
    expect(comparePackageVersions("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
  });

  it("tolerates a leading v and ignored build metadata", () => {
    expect(comparePackageVersions("v0.86.1", "0.86.0")).toBeGreaterThan(0);
    expect(comparePackageVersions("0.86.1+build.5", "0.86.1")).toBe(0);
  });

  it("returns undefined for anything that is not a version", () => {
    expect(comparePackageVersions("latest", "0.85.1")).toBeUndefined();
    expect(comparePackageVersions("0.85", "0.85.1")).toBeUndefined();
  });
});

describe("isNewerPackageVersion", () => {
  it("compares real versions", () => {
    expect(isNewerPackageVersion("0.86.1", "0.85.1")).toBe(true);
    expect(isNewerPackageVersion("0.85.1", "0.85.1")).toBe(false);
    expect(isNewerPackageVersion("0.85.0", "0.85.1")).toBe(false);
  });

  it("falls back to a plain difference check when a version cannot be parsed", () => {
    expect(isNewerPackageVersion("nightly", "0.85.1")).toBe(true);
    expect(isNewerPackageVersion("nightly", "nightly")).toBe(false);
  });
});

describe("extractLatestRelease", () => {
  it("reads version, package name and note", () => {
    expect(
      extractLatestRelease({ ok: true, version: "0.86.1", packageName: "@earendil-works/pi-coding-agent", note: "security fix" }),
    ).toEqual({
      version: "0.86.1",
      packageName: "@earendil-works/pi-coding-agent",
      note: "security fix",
    });
  });

  it("omits blank optional fields", () => {
    expect(extractLatestRelease({ version: " 0.86.1 ", packageName: "  ", note: "" })).toEqual({ version: "0.86.1" });
  });

  it("rejects payloads without a usable version", () => {
    expect(extractLatestRelease({ version: "" })).toBeUndefined();
    expect(extractLatestRelease({ version: 86 })).toBeUndefined();
    expect(extractLatestRelease(null)).toBeUndefined();
    expect(extractLatestRelease("0.86.1")).toBeUndefined();
  });
});

describe("isVersionCheckSuppressed", () => {
  it("honours pi's own offline switches", () => {
    expect(isVersionCheckSuppressed({ PI_OFFLINE: "1" })).toBe(true);
    expect(isVersionCheckSuppressed({ PI_SKIP_VERSION_CHECK: "true" })).toBe(true);
    expect(isVersionCheckSuppressed({})).toBe(false);
  });
});

describe("isUpdateCheckDue", () => {
  const intervalMs = 24 * 60 * 60 * 1000;
  const now = 1_800_000_000_000;

  it("checks when nothing has been recorded", () => {
    expect(isUpdateCheckDue(undefined, { now, extensionVersion: "1.1.2", intervalMs })).toBe(true);
  });

  it("keeps the daily interval within the same extension version", () => {
    const recent = { at: now - 60_000, by: "1.1.2" };
    expect(isUpdateCheckDue(recent, { now, extensionVersion: "1.1.2", intervalMs })).toBe(false);

    const stale = { at: now - intervalMs - 1, by: "1.1.2" };
    expect(isUpdateCheckDue(stale, { now, extensionVersion: "1.1.2", intervalMs })).toBe(true);
  });

  it("re-checks after the extension is upgraded", () => {
    const stampedByPreviousBuild = { at: now - 60_000, by: "1.1.0" };
    expect(
      isUpdateCheckDue(stampedByPreviousBuild, { now, extensionVersion: "1.1.2", intervalMs }),
    ).toBe(true);
  });

  it("treats a stamp left by the buggy 1.1.0 build as due", () => {
    // 1.1.0 wrote a bare timestamp unconditionally, so a run that never completed its request
    // still blocked the next check for a day. This is the value found in globalState on the
    // machine that reported the missing prompt.
    expect(isUpdateCheckDue(1789984051897, { now, extensionVersion: "1.1.2", intervalMs })).toBe(true);
  });
});

describe("checkForPiUpdate", () => {
  const respond = (payload: unknown) => () => Promise.resolve(payload);

  it("separates a newer release from an already-current install", async () => {
    const newer = await checkForPiUpdate("0.85.1", { requestJson: respond({ version: "0.86.1" }) });
    expect(newer).toEqual({ status: "newer", release: { version: "0.86.1" } });

    const same = await checkForPiUpdate("0.86.1", { requestJson: respond({ version: "0.86.1" }) });
    expect(same.status).toBe("current");

    const older = await checkForPiUpdate("0.86.2", { requestJson: respond({ version: "0.86.1" }) });
    expect(older.status).toBe("current");
  });

  it("reports an inconclusive check rather than pretending the install is current", async () => {
    const failed = await checkForPiUpdate("0.85.1", {
      requestJson: () => Promise.reject(new Error("ENOTFOUND")),
    });
    expect(failed.status).toBe("unknown");

    const unusable = await checkForPiUpdate("0.85.1", { requestJson: respond({ ok: true }) });
    expect(unusable.status).toBe("unknown");
  });
});

describe("shouldAdvertisePiUpdate", () => {
  it("advertises only a newer, known, not-skipped release", () => {
    expect(shouldAdvertisePiUpdate("0.86.1", "0.85.1")).toBe(true);
    expect(shouldAdvertisePiUpdate("0.86.1", "0.86.1")).toBe(false);
    expect(shouldAdvertisePiUpdate("0.86.1", "0.87.0")).toBe(false);
    expect(shouldAdvertisePiUpdate("", "0.85.1")).toBe(false);
    expect(shouldAdvertisePiUpdate(undefined, "0.85.1")).toBe(false);
    expect(shouldAdvertisePiUpdate("0.86.1", "0.85.1", ["0.86.1"])).toBe(false);
    expect(shouldAdvertisePiUpdate("0.86.1", "0.85.1", ["0.86.0"])).toBe(true);
  });
});

describe("buildPiUpdateArguments", () => {
  it("appends the update subcommand after a resolved entry point", () => {
    expect(
      buildPiUpdateArguments({ command: "node", args: ["/opt/pi/dist/cli.js"], source: "path-module" }),
    ).toEqual(["/opt/pi/dist/cli.js", "update"]);
    expect(buildPiUpdateArguments({ command: "pi", args: [], source: "path-command" })).toEqual(["update"]);
  });

  it("adds --force only when asked", () => {
    const invocation = { command: "pi", args: [], source: "path-command" } as const;
    expect(buildPiUpdateArguments(invocation, true)).toEqual(["update", "--force"]);
    expect(buildPiUpdateCommandLine(invocation)).toBe("pi update");
  });
});
