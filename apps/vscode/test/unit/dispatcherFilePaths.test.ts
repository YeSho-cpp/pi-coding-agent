import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openers = vi.hoisted(() => ({
  openReferencedLocation: vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve()),
  openEditBaseDiff: vi.fn(() => Promise.resolve(true)),
  openFileDiff: vi.fn(() => Promise.resolve()),
  fileIconDataUri: vi.fn<(name: string, isDirectory: boolean) => string>(() => "data:image/svg+xml;base64,AA=="),
}));

vi.mock("vscode", () => ({
  commands: { executeCommand: vi.fn() },
  env: { clipboard: { writeText: vi.fn() }, openExternal: vi.fn() },
  Uri: { parse: vi.fn() },
  window: {},
  workspace: {},
}));

vi.mock("../../src/extension/conversation/openReferencedLocation.js", () => ({
  openReferencedLocation: openers.openReferencedLocation,
}));
vi.mock("../../src/extension/file-changes/EditBaseContentProvider.js", () => ({
  openEditBaseDiff: openers.openEditBaseDiff,
}));
vi.mock("../../src/extension/file-changes/GitBaseContentProvider.js", () => ({
  openFileDiff: openers.openFileDiff,
}));
vi.mock("../../src/extension/composer/mentions/fileIcons.js", () => ({
  fileIconDataUri: openers.fileIconDataUri,
}));

const { WebviewActionDispatcher } = await import("../../src/extension/webview-host/WebviewActionDispatcher.js");

/**
 * The Webview sends file paths exactly as the agent wrote them. The host is the one place that knows
 * the session's working directory and the home directory, so it is where `~/x` and `x` get resolved.
 */

const CWD = "/work/project";

function setup(conversationItems: unknown[] = []) {
  const registry = {
    hasSession: vi.fn(() => true),
    sessionView: vi.fn(() => ({ cwd: CWD, conversationItems, attachmentLimits: { maxImageBytes: 1024 } })),
  };
  const dispatcher = new WebviewActionDispatcher({
    registry: registry as never,
    logger: { error: vi.fn(), info: vi.fn() } as never,
    drafts: {} as never,
    openPanel: vi.fn(),
    revealPanel: vi.fn(),
    openComposerEditor: vi.fn(),
  });
  const posted: { type: string; [key: string]: unknown }[] = [];
  const connection = {
    surface: { kind: "sidebar" as const },
    sessionId: "s1",
    fileSearch: {} as never,
    post: (message: never) => posted.push(message),
    insertPromptText: vi.fn(),
  };
  const send = (message: Record<string, unknown>) =>
    dispatcher.dispatch({ bridgeVersion: "3.2", ...message } as never, connection);
  return { send, posted };
}

beforeEach(() => {
  for (const opener of Object.values(openers)) opener.mockClear();
});

describe("openDiff", () => {
  it("resolves a path under the home directory before opening either diff", async () => {
    const { send } = setup();

    await send({ type: "openDiff", path: "~/.config/tool/settings.json", baseToolCallId: "call-1" });

    expect(openers.openEditBaseDiff).toHaveBeenCalledWith(join(homedir(), ".config/tool/settings.json"), "call-1");
    expect(openers.openFileDiff).not.toHaveBeenCalled();
  });

  it("resolves a path relative to the session working directory", async () => {
    const { send } = setup();

    await send({ type: "openDiff", path: "src/app.ts", baseToolCallId: "call-2" });

    expect(openers.openEditBaseDiff).toHaveBeenCalledWith(`${CWD}/src/app.ts`, "call-2");
  });

  it("leaves an absolute path as it is", async () => {
    const { send } = setup();

    await send({ type: "openDiff", path: "/etc/hosts", baseToolCallId: "call-3" });

    expect(openers.openEditBaseDiff).toHaveBeenCalledWith("/etc/hosts", "call-3");
  });

  it("falls back to the Git HEAD diff of the same resolved file when the snapshot is gone", async () => {
    const { send } = setup();
    openers.openEditBaseDiff.mockResolvedValueOnce(false);

    await send({ type: "openDiff", path: "~/work/a.ts", baseToolCallId: "stale" });

    expect(openers.openFileDiff).toHaveBeenCalledWith(join(homedir(), "work/a.ts"));
  });

  it("goes straight to the Git diff when the tool call has no snapshot id", async () => {
    const { send } = setup();

    await send({ type: "openDiff", path: "~/work/a.ts" });

    expect(openers.openEditBaseDiff).not.toHaveBeenCalled();
    expect(openers.openFileDiff).toHaveBeenCalledWith(join(homedir(), "work/a.ts"));
  });
});

describe("openFile", () => {
  it("hands the reference to the opener untouched, with the session's working directory", async () => {
    const { send } = setup();

    await send({ type: "openFile", path: "~/.cache/mori-rmac/upstream/issue.md", line: 4 });

    expect(openers.openReferencedLocation).toHaveBeenCalledWith(
      expect.objectContaining({ path: "~/.cache/mori-rmac/upstream/issue.md", line: 4 }),
      CWD,
      expect.any(Function),
    );
  });

  it("lets the opener read where the session's tool calls worked", async () => {
    const bash = (command: string) => ({
      id: command,
      type: "tool",
      timestamp: 0,
      tool: { state: "bound", id: command, name: "bash", label: command, status: "complete", isError: false, startedAt: 0, args: { command } },
    });
    const { send } = setup([
      { id: "turn", type: "turn", status: "completed", startedAt: 0, items: [bash("cd /work/HPN/DeepEP && sed -n 1,20p tests/elastic/test_ep.py")] },
    ]);

    await send({ type: "openFile", path: "tests/elastic/test_ep.py", line: 65 });

    const sessionPaths = openers.openReferencedLocation.mock.calls[0]?.[2] as () => string[];
    expect(sessionPaths()).toContain(resolve("/work/HPN/DeepEP/tests/elastic/test_ep.py"));
  });
});

describe("fileIcon", () => {
  it("names the icon after the file under the home directory", async () => {
    const { send, posted } = setup();

    await send({ type: "fileIcon", requestId: "r1", path: "~/.cache/mori-rmac/upstream/issue.md" });

    expect(openers.fileIconDataUri).toHaveBeenCalledWith("issue.md", false);
    expect(posted).toContainEqual({ type: "fileIconResult", requestId: "r1", dataUri: "data:image/svg+xml;base64,AA==" });
  });

  it("finds out that ~ is a folder by checking the real home directory", async () => {
    const { send } = setup();

    await send({ type: "fileIcon", requestId: "r2", path: "~" });

    expect(openers.fileIconDataUri).toHaveBeenCalledWith("~", true);
  });

  describe("with a home directory of its own", () => {
    let home: string;
    let previous: { HOME: string | undefined; USERPROFILE: string | undefined };

    beforeEach(async () => {
      home = await mkdtemp(join(tmpdir(), "dispatcher-home-"));
      await mkdir(join(home, "projects"));
      await writeFile(join(home, "notes.md"), "# notes\n");
      previous = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
      process.env.HOME = home;
      process.env.USERPROFILE = home;
    });

    afterEach(async () => {
      if (previous.HOME === undefined) delete process.env.HOME; else process.env.HOME = previous.HOME;
      if (previous.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = previous.USERPROFILE;
      await rm(home, { recursive: true, force: true });
    });

    it("calls a folder under home a folder, a file a file, and a path that is not there a file", async () => {
      const { send } = setup();

      await send({ type: "fileIcon", requestId: "r3", path: "~/projects" });
      await send({ type: "fileIcon", requestId: "r4", path: "~/notes.md" });
      await send({ type: "fileIcon", requestId: "r5", path: "~/missing/place.md" });

      expect(openers.fileIconDataUri).toHaveBeenNthCalledWith(1, "projects", true);
      expect(openers.fileIconDataUri).toHaveBeenNthCalledWith(2, "notes.md", false);
      expect(openers.fileIconDataUri).toHaveBeenNthCalledWith(3, "place.md", false);
    });
  });
});
