import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { expandHome, resolveReferencePath, startsAtHome } from "../../src/extension/_shared/paths/expandHome.js";

/**
 * The rules are Pi's own (`utils/paths.js`), because the paths the agent writes are written for
 * Pi: `~` and `~/x` mean the home directory, `~name/x` is not expanded, and everything else is
 * relative to the session's working directory.
 */

const HOME = "/home/ada";
const CWD = "/work/project";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("expandHome", () => {
  it.each<[string, string]>([
    ["~", HOME],
    ["~/", HOME],
    ["~/.cache/mori/issue.md", `${HOME}/.cache/mori/issue.md`],
    ["~/Code/", `${HOME}/Code/`],
    ["~//double", `${HOME}/double`],
  ])("expands %s", (input, expected) => {
    expect(expandHome(input, { homeDirectory: HOME })).toBe(expected);
  });

  it.each([
    "~user/notes.md",
    "~foo",
    "a/~/b",
    "src/~/x.ts",
    "./~/x.ts",
    "/abs/~/x",
    "~~/x",
    "",
    "plain.txt",
  ])("leaves %j alone: only a leading ~ or ~/ is the home directory", (input) => {
    expect(expandHome(input, { homeDirectory: HOME })).toBe(input);
  });

  it("treats a backslash after the tilde as a separator only where backslash separates paths", () => {
    expect(expandHome("~\\x\\y", { homeDirectory: "C:\\Users\\ada", separators: "both" })).toBe(join("C:\\Users\\ada", "x\\y"));
    expect(expandHome("~\\x", { homeDirectory: HOME, separators: "native" })).toBe(process.platform === "win32" ? join(HOME, "x") : "~\\x");
  });

  it("uses this machine's home directory by default", () => {
    expect(expandHome("~/x")).toBe(join(homedir(), "x"));
  });
});

describe("resolveReferencePath", () => {
  const resolveAt = (path: string, base = CWD) => resolveReferencePath(path, base, { homeDirectory: HOME });

  it("reads the failing report: a file in a dot-directory under home", () => {
    expect(resolveAt("~/.cache/mori-rmac/upstream/issue.md", "/Users/yesho/Code/HPN/miks-cluster-burn"))
      .toBe(`${HOME}/.cache/mori-rmac/upstream/issue.md`);
  });

  it.each<[string, string]>([
    ["~", HOME],
    ["~/x.md", `${HOME}/x.md`],
    ["$HOME/x.md", `${HOME}/x.md`],
    ["${HOME}/x.md", `${HOME}/x.md`],
    ["$HOME", HOME],
    ["${HOME}", HOME],
  ])("expands %s to the home directory", (input, expected) => {
    expect(resolveAt(input)).toBe(expected);
  });

  it("keeps the trailing separator that marks a folder under home or at an absolute path", () => {
    expect(resolveAt("~/Code/")).toBe(`${HOME}/Code/`);
    expect(resolveAt("$HOME/Code/")).toBe(`${HOME}/Code/`);
    expect(resolveAt("/abs/dir/")).toBe("/abs/dir/");
  });

  it("does not depend on that separator: a bare ~/ and $HOME/ are both just the home directory", () => {
    expect(resolveAt("~/")).toBe(HOME);
    expect(resolveAt("$HOME/")).toBe(HOME);
  });

  it.each<[string, string]>([
    ["/etc/hosts", "/etc/hosts"],
    ["src/file.ts", `${CWD}/src/file.ts`],
    ["./src/file.ts", `${CWD}/src/file.ts`],
    ["../sibling/file.ts", "/work/sibling/file.ts"],
    ["file.ts", `${CWD}/file.ts`],
  ])("keeps %s where it already points", (input, expected) => {
    expect(resolveAt(input)).toBe(resolve(expected));
  });

  it("leaves another user's home, and look-alike variables, relative to the working directory", () => {
    expect(resolveAt("~bob/x.md")).toBe(`${CWD}/~bob/x.md`);
    expect(resolveAt("$HOMEDIR/x.md")).toBe(`${CWD}/$HOMEDIR/x.md`);
    expect(resolveAt("$HOME2/x.md")).toBe(`${CWD}/$HOME2/x.md`);
    expect(resolveAt("${HOMEx}/x.md")).toBe(`${CWD}/\${HOMEx}/x.md`);
  });

  it("reaches a directory literally named ~ when it is spelled relative", () => {
    expect(resolveAt("./~/x.md")).toBe(`${CWD}/~/x.md`);
  });

  it("does not look at the file system: a path that is not there still resolves", () => {
    expect(resolveAt("~/definitely/not/a/real/place.md")).toBe(`${HOME}/definitely/not/a/real/place.md`);
  });

  it("falls back to this machine's home directory", () => {
    expect(resolveReferencePath("~/x", CWD)).toBe(join(homedir(), "x"));
  });
});

describe("startsAtHome", () => {
  it.each(["~", "~/x", "$HOME", "$HOME/x", "${HOME}/x", "${HOME}"])("recognises %s", (input) => {
    expect(startsAtHome(input)).toBe(true);
  });

  it.each(["~bob/x", "$HOMEDIR/x", "./~/x", "src/x", "/abs", "", "a~/b"])("does not recognise %j", (input) => {
    expect(startsAtHome(input)).toBe(false);
  });

  it("agrees with expandHome about what counts as a home path", () => {
    for (const input of ["~", "~/", "~/a", "~a", "~a/b", "~\\a", "x/~", "~~"]) {
      expect(startsAtHome(input)).toBe(expandHome(input, { homeDirectory: "/h" }) !== input);
    }
  });
});
