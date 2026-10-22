import { describe, expect, it } from "vitest";

import {
  isInsideDirectory,
  planNewSessionDirectories,
  type PlannedNewSessionDirectory,
} from "../../src/extension/sessions/NewSessionDirectories";
import type { SessionWorkingDirectory } from "../../src/extension/sessions/SessionWorkingDirectories";

function root(cwd: string, isCurrent = true): SessionWorkingDirectory {
  return { cwd, workspaceFolderCwd: cwd, directoryName: cwd.split("/").pop() ?? cwd, isCurrent };
}

function worktree(cwd: string, branch: string, folderCwd: string): SessionWorkingDirectory {
  return { cwd, workspaceFolderCwd: folderCwd, worktreeRoot: cwd, directoryName: branch, branch, isCurrent: false };
}

describe("isInsideDirectory", () => {
  it("accepts descendants and rejects siblings and parents", () => {
    expect(isInsideDirectory("/w", "/w/projects/rccl")).toBe(true);
    expect(isInsideDirectory("/w", "/w")).toBe(true);
    expect(isInsideDirectory("/w", "/w-other")).toBe(false);
    expect(isInsideDirectory("/w", "/elsewhere")).toBe(false);
  });
});

describe("planNewSessionDirectories", () => {
  it("lists every workspace root first, then projects, then worktrees", async () => {
    const folderA = "/w/projects/rccl";
    const folderB = "/w/projects/rccl-tests";
    const planned = await planNewSessionDirectories({
      folderCwds: [folderA, folderB],
      discoveries: [
        { folderCwd: folderA, directories: [root(folderA), worktree("/w.worktrees/feat", "feat", folderA)] },
        { folderCwd: folderB, directories: [root(folderB)] },
      ],
      knownCwds: ["/w/projects/rccl/inner", "/outside/repo"],
      isDirectory: (path) => Promise.resolve(path === "/w/projects/rccl/inner"),
    });

    expect(planned.map((entry) => [entry.kind, entry.directory.cwd])).toEqual([
      ["workspace", folderA],
      ["workspace", folderB],
      ["project", "/w/projects/rccl/inner"],
      ["worktree", "/w.worktrees/feat"],
    ]);
    const project = planned.find((entry) => entry.kind === "project")!;
    expect(project.directory.workspaceFolderCwd).toBe(folderA);
  });

  it("skips known cwds that duplicate a root or point at a missing directory", async () => {
    const planned = await planNewSessionDirectories({
      folderCwds: ["/w"],
      discoveries: [{ folderCwd: "/w", directories: [root("/w")] }],
      knownCwds: ["/w", "/w/gone"],
      isDirectory: () => Promise.resolve(false),
    });

    expect(planned).toHaveLength(1);
    expect(planned[0]!.kind).toBe("workspace");
  });

  it("keeps the discovery order inside each kind", async () => {
    const planned: PlannedNewSessionDirectory[] = await planNewSessionDirectories({
      folderCwds: ["/b", "/a"],
      discoveries: [
        { folderCwd: "/b", directories: [root("/b")] },
        { folderCwd: "/a", directories: [root("/a")] },
      ],
      knownCwds: [],
    });

    expect(planned.map((entry) => entry.directory.cwd)).toEqual(["/b", "/a"]);
  });
});
