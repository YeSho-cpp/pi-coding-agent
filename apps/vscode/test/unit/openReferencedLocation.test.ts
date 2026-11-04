import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vscodeMock = vi.hoisted(() => {
  class Position {
    constructor(readonly line: number, readonly character: number) {}
  }

  class Selection {
    constructor(readonly anchor: Position, readonly active: Position) {}
  }

  class Range {
    constructor(readonly start: Position, readonly end: Position) {}
  }

  const document = {
    validatePosition: vi.fn((position: Position) => position),
    lineAt: vi.fn((line: number) => ({ range: { end: new Position(line, 12) } })),
  };
  const editor = {
    selection: undefined as Selection | undefined,
    revealRange: vi.fn(),
  };

  return {
    Position,
    Selection,
    Range,
    document,
    editor,
    Uri: {
      file: vi.fn((fsPath: string) => ({ fsPath })),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
      fs: {
        stat: vi.fn<(uri: { fsPath: string }) => Promise<{ type?: number }>>(() => Promise.resolve({})),
      },
      openTextDocument: vi.fn(() => Promise.resolve(document)),
    },
    window: {
      showTextDocument: vi.fn(() => Promise.resolve(editor)),
    },
    TextEditorRevealType: {
      InCenterIfOutsideViewport: 1,
    },
    commands: {
      executeCommand: vi.fn(() => Promise.resolve(undefined)),
    },
    FileType: {
      File: 1,
      Directory: 2,
    },
  };
});

const searchMock = vi.hoisted(() => ({
  search: vi.fn(),
}));

vi.mock("vscode", () => ({
  Position: vscodeMock.Position,
  Selection: vscodeMock.Selection,
  Range: vscodeMock.Range,
  Uri: vscodeMock.Uri,
  workspace: vscodeMock.workspace,
  window: vscodeMock.window,
  TextEditorRevealType: vscodeMock.TextEditorRevealType,
  commands: vscodeMock.commands,
  FileType: vscodeMock.FileType,
}));

vi.mock("../../src/extension/fd/WorkspaceFileSearch.js", () => ({
  WorkspaceFileSearch: class {
    readonly search = searchMock.search;
  },
}));

const { openReferencedLocation } = await import(
  "../../src/extension/conversation/openReferencedLocation.js"
);
const { sessionToolPaths } = await import("../../src/extension/conversation/sessionPathEvidence.js");

describe("openReferencedLocation", () => {
  beforeEach(() => {
    vscodeMock.Uri.file.mockClear();
    vscodeMock.workspace.fs.stat.mockClear();
    vscodeMock.workspace.openTextDocument.mockClear();
    vscodeMock.window.showTextDocument.mockClear();
    vscodeMock.document.validatePosition.mockClear();
    vscodeMock.document.lineAt.mockClear();
    vscodeMock.editor.revealRange.mockClear();
    vscodeMock.editor.selection = undefined;
    vscodeMock.commands.executeCommand.mockClear();
    searchMock.search.mockReset();
  });

  it("reveals a directory reference in the Explorer instead of opening it as a document", async () => {
    vscodeMock.workspace.fs.stat.mockResolvedValueOnce({ type: 2 });

    await openReferencedLocation({ path: "/repo/pat-trace/" }, resolve("workspace"));

    expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
      "revealInExplorer",
      expect.objectContaining({ fsPath: "/repo/pat-trace/" }),
    );
    expect(vscodeMock.workspace.openTextDocument).not.toHaveBeenCalled();
    expect(searchMock.search).not.toHaveBeenCalled();
  });

  it("resolves relative references from the active session working directory", async () => {
    const sessionCwd = resolve("worktrees", "feature");

    await openReferencedLocation({ path: "src/file.ts" }, sessionCwd);

    expect(vscodeMock.Uri.file).toHaveBeenCalledWith(resolve(sessionCwd, "src/file.ts"));
  });

  it.each(["~/.cache/mori-rmac/upstream/issue.md", "$HOME/.cache/mori-rmac/upstream/issue.md", "${HOME}/.cache/mori-rmac/upstream/issue.md"])(
    "opens %s from the home directory, never under the session's working directory",
    async (reference) => {
      const sessionCwd = resolve("worktrees", "feature");

      await openReferencedLocation({ path: reference }, sessionCwd);

      expect(vscodeMock.Uri.file).toHaveBeenCalledWith(join(homedir(), ".cache/mori-rmac/upstream/issue.md"));
      expect(vscodeMock.Uri.file).not.toHaveBeenCalledWith(expect.stringContaining(`${sessionCwd}${"/"}~`));
      expect(vscodeMock.workspace.openTextDocument).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps the line and column of a home-directory reference", async () => {
    await openReferencedLocation({ path: "~/notes/todo.md", line: 7, column: 3 }, resolve("workspace"));

    expect(vscodeMock.Uri.file).toHaveBeenCalledWith(join(homedir(), "notes/todo.md"));
    expect(vscodeMock.editor.selection?.anchor).toMatchObject({ line: 6, character: 2 });
  });

  it("reveals a folder under the home directory in the Explorer", async () => {
    vscodeMock.workspace.fs.stat.mockResolvedValueOnce({ type: 2 });

    await openReferencedLocation({ path: "~/.cache/mori-rmac/" }, resolve("workspace"));

    expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
      "revealInExplorer",
      expect.objectContaining({ fsPath: join(homedir(), ".cache/mori-rmac") + "/" }),
    );
  });

  it("does not hunt through the project for a home-directory file that is missing", async () => {
    vscodeMock.workspace.fs.stat.mockRejectedValueOnce(new Error("ENOENT"));
    searchMock.search.mockResolvedValue([{ path: "docs/issue.md", isDirectory: false, score: 1 }]);
    vscodeMock.workspace.openTextDocument.mockRejectedValueOnce(new Error("Unable to resolve nonexistent file"));

    await expect(
      openReferencedLocation({ path: "~/.cache/mori-rmac/upstream/issue.md" }, resolve("workspace")),
    ).rejects.toThrow("Unable to resolve nonexistent file");

    expect(searchMock.search).not.toHaveBeenCalled();
    expect(vscodeMock.Uri.file).not.toHaveBeenCalledWith(expect.stringContaining("docs"));
  });

  it("still searches the project for a missing relative reference", async () => {
    vscodeMock.workspace.fs.stat.mockRejectedValueOnce(new Error("ENOENT"));
    searchMock.search.mockResolvedValue([]);
    vscodeMock.workspace.openTextDocument.mockRejectedValueOnce(new Error("Unable to resolve nonexistent file"));

    await expect(openReferencedLocation({ path: "docs/issue.md" }, resolve("workspace"))).rejects.toThrow();

    expect(searchMock.search).toHaveBeenCalledTimes(1);
  });

  it("positions the editor at the one-based line and column", async () => {
    await openReferencedLocation({ path: "src/file.ts", line: 42, column: 5 }, resolve("workspace"));

    expect(vscodeMock.document.validatePosition).toHaveBeenCalledWith(
      expect.objectContaining({ line: 41, character: 4 }),
    );
    expect(vscodeMock.editor.selection?.anchor).toMatchObject({ line: 41, character: 4 });
    expect(vscodeMock.editor.revealRange).toHaveBeenCalledOnce();
  });

  it("selects complete lines for a line range", async () => {
    await openReferencedLocation({ path: "src/file.ts", line: 5, endLine: 10 }, resolve("workspace"));

    expect(vscodeMock.editor.selection?.anchor).toMatchObject({ line: 4, character: 0 });
    expect(vscodeMock.editor.selection?.active).toMatchObject({ line: 9, character: 12 });
    expect(vscodeMock.editor.revealRange).toHaveBeenCalledOnce();
  });

  it("does not consult the workspace fallback when the file exists", async () => {
    await openReferencedLocation({ path: "src/file.ts" }, resolve("workspace"));

    expect(searchMock.search).not.toHaveBeenCalled();
  });

  it("opens the best workspace match when the reference path is missing", async () => {
    vscodeMock.workspace.fs.stat.mockRejectedValueOnce(new Error("ENOENT"));
    searchMock.search.mockResolvedValue([{ path: "moved/file.ts", isDirectory: false, score: 1 }]);

    await openReferencedLocation({ path: "src/file.ts", line: 3 }, resolve("workspace"));

    expect(searchMock.search).toHaveBeenCalledWith(
      resolve("workspace"),
      "src/file.ts",
      1,
      expect.any(Set),
      expect.objectContaining({ excludeRules: [] }),
    );
    expect(vscodeMock.Uri.file).toHaveBeenLastCalledWith(resolve("workspace", "moved/file.ts"));
    expect(vscodeMock.editor.revealRange).toHaveBeenCalledOnce();
  });

  it("queries by basename for a stale absolute reference", async () => {
    vscodeMock.workspace.fs.stat.mockRejectedValueOnce(new Error("ENOENT"));
    searchMock.search.mockResolvedValue([]);

    const basePath = resolve("workspace");
    await openReferencedLocation({ path: resolve(basePath, "old/dir/file.ts") }, basePath);

    expect(searchMock.search).toHaveBeenCalledWith(
      basePath,
      "file.ts",
      1,
      expect.any(Set),
      expect.anything(),
    );
  });

  it("treats a directory match as no match", async () => {
    vscodeMock.workspace.fs.stat.mockRejectedValueOnce(new Error("ENOENT"));
    searchMock.search.mockResolvedValue([{ path: "moved/dir", isDirectory: true, score: 1 }]);
    vscodeMock.workspace.openTextDocument.mockRejectedValueOnce(new Error("Unable to resolve nonexistent file"));

    await expect(
      openReferencedLocation({ path: "src/file.ts" }, resolve("workspace")),
    ).rejects.toThrow("Unable to resolve nonexistent file");
  });

  it("surfaces the original open error when the fallback has no match", async () => {
    vscodeMock.workspace.fs.stat.mockRejectedValueOnce(new Error("ENOENT"));
    searchMock.search.mockResolvedValue([]);
    vscodeMock.workspace.openTextDocument.mockRejectedValueOnce(new Error("Unable to resolve nonexistent file"));

    await expect(
      openReferencedLocation({ path: "src/file.ts" }, resolve("workspace")),
    ).rejects.toThrow("Unable to resolve nonexistent file");
  });

  it("surfaces the original open error when the fallback search fails", async () => {
    vscodeMock.workspace.fs.stat.mockRejectedValueOnce(new Error("ENOENT"));
    searchMock.search.mockRejectedValue(new Error("fd not found"));
    vscodeMock.workspace.openTextDocument.mockRejectedValueOnce(new Error("Unable to resolve nonexistent file"));

    await expect(
      openReferencedLocation({ path: "src/file.ts" }, resolve("workspace")),
    ).rejects.toThrow("Unable to resolve nonexistent file");
  });

  describe("when the agent worked in another repository", () => {
    const sessionCwd = resolve("/work/HPN/mori");
    const deepEp = resolve("/work/HPN/DeepEP");
    const inDeepEp = (path: string): string => resolve(deepEp, path);
    // Pi was run in mori but read DeepEP through `cd`, then cited DeepEP files relative to DeepEP.
    const toolPaths = (): string[] => sessionToolPaths(
      [{
        id: "turn",
        type: "turn",
        status: "completed",
        startedAt: 0,
        items: [
          bashTool("cd /work/HPN/DeepEP && sed -n 1,120p tests/elastic/test_ep.py"),
          bashTool("cd /work/HPN/DeepEP && sed -n 88,175p csrc/kernels/elastic/dispatch.hpp"),
        ],
      }],
      sessionCwd,
    );
    let existing: Map<string, number>;

    function bashTool(command: string) {
      return {
        id: command,
        type: "tool" as const,
        timestamp: 0,
        tool: {
          state: "bound" as const,
          id: command,
          name: "bash",
          label: command,
          status: "complete" as const,
          isError: false,
          startedAt: 0,
          args: { command },
        },
      };
    }

    const openedPath = (): string | undefined =>
      (vscodeMock.workspace.openTextDocument.mock.calls[0] as unknown as [{ fsPath: string }] | undefined)?.[0].fsPath;

    beforeEach(() => {
      existing = new Map([
        [inDeepEp("tests/elastic/test_ep.py"), 1],
        [inDeepEp("csrc/kernels/elastic/dispatch.hpp"), 1],
        [inDeepEp("csrc/kernels/elastic"), 2],
      ]);
      vscodeMock.workspace.fs.stat.mockImplementation((uri) => {
        const type = existing.get(uri.fsPath);
        return type === undefined ? Promise.reject(new Error("ENOENT")) : Promise.resolve({ type });
      });
    });

    afterEach(() => {
      vscodeMock.workspace.fs.stat.mockImplementation(() => Promise.resolve({}));
    });

    it("opens the file the agent read in the other repository at the cited line", async () => {
      await openReferencedLocation({ path: "tests/elastic/test_ep.py", line: 65 }, sessionCwd, toolPaths);

      expect(openedPath()).toBe(inDeepEp("tests/elastic/test_ep.py"));
      expect(vscodeMock.editor.selection?.anchor).toMatchObject({ line: 64, character: 0 });
      expect(searchMock.search).not.toHaveBeenCalled();
    });

    it("opens a bare file name the same way", async () => {
      await openReferencedLocation({ path: "test_ep.py", line: 483 }, sessionCwd, toolPaths);

      expect(openedPath()).toBe(inDeepEp("tests/elastic/test_ep.py"));
    });

    it("opens a header cited relative to the other repository", async () => {
      await openReferencedLocation({ path: "csrc/kernels/elastic/dispatch.hpp", line: 303 }, sessionCwd, toolPaths);

      expect(openedPath()).toBe(inDeepEp("csrc/kernels/elastic/dispatch.hpp"));
      expect(vscodeMock.editor.selection?.anchor).toMatchObject({ line: 302 });
    });

    it("finds a file the agent never opened through any other path it used in that repository", async () => {
      existing.set(inDeepEp("deep_ep/buffer.py"), 1);

      await openReferencedLocation({ path: "deep_ep/buffer.py" }, sessionCwd, () => [inDeepEp("tests/elastic/test_ep.py")]);

      expect(openedPath()).toBe(inDeepEp("deep_ep/buffer.py"));
    });

    it("reveals a folder of the other repository in the Explorer", async () => {
      await openReferencedLocation({ path: "csrc/kernels/elastic/" }, sessionCwd, toolPaths);

      expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
        "revealInExplorer",
        expect.objectContaining({ fsPath: inDeepEp("csrc/kernels/elastic") }),
      );
      expect(vscodeMock.workspace.openTextDocument).not.toHaveBeenCalled();
    });

    it("keeps preferring the session's own directory when the file exists there", async () => {
      existing.set(resolve(sessionCwd, "tests/elastic/test_ep.py"), 1);
      const history = vi.fn(toolPaths);

      await openReferencedLocation({ path: "tests/elastic/test_ep.py" }, sessionCwd, history);

      expect(openedPath()).toBe(resolve(sessionCwd, "tests/elastic/test_ep.py"));
      expect(history).not.toHaveBeenCalled();
    });

    it("opens the most recently used repository when several have the file", async () => {
      const other = resolve("/work/HPN/MoonEP");
      existing.set(resolve(other, "tests/elastic/test_ep.py"), 1);
      const newestFirst = (): string[] => [resolve(other, "tests/elastic/test_ep.py"), inDeepEp("tests/elastic/test_ep.py")];

      await openReferencedLocation({ path: "tests/elastic/test_ep.py" }, sessionCwd, newestFirst);

      expect(openedPath()).toBe(resolve(other, "tests/elastic/test_ep.py"));
    });

    it("falls back to the workspace search when nothing the session used has the file", async () => {
      searchMock.search.mockResolvedValue([{ path: "docs/guide.md", isDirectory: false, score: 1 }]);

      await openReferencedLocation({ path: "guide.md" }, sessionCwd, toolPaths);

      expect(searchMock.search).toHaveBeenCalledTimes(1);
      expect(openedPath()).toBe(resolve(sessionCwd, "docs/guide.md"));
    });

    it("surfaces the original open error when neither the session nor the workspace has the file", async () => {
      searchMock.search.mockResolvedValue([]);
      vscodeMock.workspace.openTextDocument.mockRejectedValueOnce(new Error("Unable to resolve nonexistent file"));

      await expect(openReferencedLocation({ path: "tests/nowhere.py" }, sessionCwd, toolPaths)).rejects.toThrow(
        "Unable to resolve nonexistent file",
      );

      expect(vscodeMock.Uri.file).toHaveBeenCalledWith(resolve(sessionCwd, "tests/nowhere.py"));
    });

    it("does not read the session's history for a home or absolute reference", async () => {
      existing.clear();
      searchMock.search.mockResolvedValue([]);
      const history = vi.fn(toolPaths);

      await openReferencedLocation({ path: "~/notes/todo.md" }, sessionCwd, history);
      await openReferencedLocation({ path: resolve("/old/machine/test_ep.py") }, sessionCwd, history);

      expect(history).not.toHaveBeenCalled();
    });

    it("checks no candidate twice and none outside the evidence", async () => {
      existing.clear();
      searchMock.search.mockResolvedValue([]);

      await openReferencedLocation({ path: "tests/elastic/test_ep.py" }, sessionCwd, toolPaths);

      const asked = vscodeMock.workspace.fs.stat.mock.calls.map(([uri]) => uri.fsPath);
      expect(new Set(asked).size).toBe(asked.length);
      expect(asked[0]).toBe(resolve(sessionCwd, "tests/elastic/test_ep.py"));
    });
  });
});
