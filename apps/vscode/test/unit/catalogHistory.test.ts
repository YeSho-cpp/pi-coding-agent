import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({ folders: [] as string[] }));

vi.mock("vscode", () => {
  class EventEmitter<T> {
    readonly listeners = new Set<(value: T) => void>();
    readonly event = (listener: (value: T) => void) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
    fire(value: T): void { for (const listener of this.listeners) listener(value); }
    dispose(): void { this.listeners.clear(); }
  }

  return {
    EventEmitter,
    ProgressLocation: { Window: 10 },
    QuickPickItemKind: { Separator: -1 },
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    commands: { executeCommand: vi.fn().mockResolvedValue(undefined) },
    env: { remoteName: undefined },
    window: { activeTextEditor: undefined, state: { focused: true, active: true } },
    workspace: {
      get workspaceFolders() {
        return environment.folders.map((fsPath, index) => ({ name: `folder-${index}`, uri: { fsPath } }));
      },
      getConfiguration: () => ({ get: (...args: [key: string, fallback: unknown]) => args[1] }),
      getWorkspaceFolder: () => undefined,
    },
    extensions: { getExtension: () => undefined },
  };
});

const { SessionRegistry } = await import("../../src/extension/sessions/SessionRegistry.js");
const { workspacePiSessionRoots } = await import("../../src/extension/sessions/catalog/SessionCatalog.js");

/**
 * The welcome page lists the sessions Pi has saved for the open folders. Pi names a session file by
 * its creation time and the folder listing runs oldest first, so a list cut off after the first
 * files shows the oldest sessions of a busy project and hides the latest. These run the real
 * Registry over real files and read what the welcome page would be given.
 */

const BASE = 1_700_000_000;
const HOUR = 3_600;
const LIST_CAP = 30;

interface SavedSession {
  title: string;
  createdAt: number;
  modifiedAt: number;
}

/** `count` sessions named "<prefix> 1" … "<prefix> N", each created and last written after the one before. */
function sessionsInOrder(prefix: string, count: number, start = BASE): SavedSession[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `${prefix} ${index + 1}`,
    createdAt: start + index * HOUR,
    modifiedAt: start + index * HOUR + 60,
  }));
}

let root: string;
let previousAgentDirectory: string | undefined;
const registries: InstanceType<typeof SessionRegistry>[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "catalog-history-"));
  previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(root, "agent");
  environment.folders = [];
});

afterEach(async () => {
  await Promise.all(registries.splice(0).map((registry) => registry.dispose()));
  if (previousAgentDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
  await rm(root, { recursive: true, force: true });
});

/** A project folder whose Pi session folder holds one file per saved session, named as Pi names them. */
async function project(name: string, sessions: SavedSession[], extraFiles: string[] = []): Promise<string> {
  const folder = join(root, name);
  await mkdir(folder, { recursive: true });
  const sessionsFolder = workspacePiSessionRoots(folder)[0]!;
  await mkdir(sessionsFolder, { recursive: true });
  for (const [index, session] of sessions.entries()) {
    const created = new Date(session.createdAt * 1000).toISOString().replace(/[:.]/g, "-");
    const path = join(sessionsFolder, `${created}_${name}-${index}.jsonl`);
    await writeFile(path, [
      JSON.stringify({ type: "session", version: 3, id: `${name}-${index}`, cwd: folder }),
      JSON.stringify({ type: "session_info", name: session.title }),
    ].join("\n") + "\n");
    await utimes(path, session.modifiedAt, session.modifiedAt);
  }
  for (const extra of extraFiles) await writeFile(join(sessionsFolder, extra), "not a session\n");
  return folder;
}

/** Titles on the welcome page, in the order shown, for a window that has these folders open. */
async function welcomeHistory(...folders: string[]): Promise<string[]> {
  environment.folders = folders;
  const registry = new SessionRegistry(
    {
      workspaceState: { get: () => undefined, update: () => Promise.resolve() },
      secrets: { get: () => Promise.resolve(undefined), store: () => Promise.resolve(), delete: () => Promise.resolve() },
    } as never,
    { error: vi.fn(), info: vi.fn() } as never,
  );
  registries.push(registry);
  await registry.refreshCatalogSessions();
  return (registry.snapshot().catalogSessions ?? []).map((entry) => entry.title);
}

describe("the welcome page's history of a busy project", () => {
  it("shows the newest sessions when the project has more than the list can hold", async () => {
    const folder = await project("busy", sessionsInOrder("Session", 45));

    const titles = await welcomeHistory(folder);

    expect(titles).toHaveLength(LIST_CAP);
    expect(titles[0]).toBe("Session 45");
    expect(titles.at(-1)).toBe("Session 16");
    expect(titles).not.toContain("Session 1");
    expect(titles).not.toContain("Session 15");
  });

  it("keeps a long-running old session near the top, because it was written to most recently", async () => {
    const sessions = sessionsInOrder("Session", 40);
    sessions[0] = { ...sessions[0]!, modifiedAt: BASE + 100 * HOUR };

    const titles = await welcomeHistory(await project("resumed", sessions));

    expect(titles[0]).toBe("Session 1");
    expect(titles).toHaveLength(LIST_CAP);
    expect(titles).toContain("Session 40");
  });

  it("fills the list from the newest sessions of every open folder, not folder by folder", async () => {
    const older = await project("older", sessionsInOrder("Older", 20, BASE));
    const newer = await project("newer", sessionsInOrder("Newer", 20, BASE + 500 * HOUR));

    const titles = await welcomeHistory(older, newer);

    expect(titles).toHaveLength(LIST_CAP);
    for (let index = 1; index <= 20; index += 1) expect(titles).toContain(`Newer ${index}`);
    expect(titles.filter((title) => title.startsWith("Older"))).toEqual(
      Array.from({ length: 10 }, (_, index) => `Older ${20 - index}`),
    );
  });
});

describe("the welcome page's history of a small project", () => {
  it("lists every session newest first and ignores files that are not sessions", async () => {
    const folder = await project("small", sessionsInOrder("Session", 5), ["notes.txt", "x.jsonl.bak", "settings.json"]);

    expect(await welcomeHistory(folder)).toEqual(["Session 5", "Session 4", "Session 3", "Session 2", "Session 1"]);
  });

  it("lists exactly the cap's worth when the project has exactly that many", async () => {
    const titles = await welcomeHistory(await project("exact", sessionsInOrder("Session", LIST_CAP)));

    expect(titles).toHaveLength(LIST_CAP);
    expect(titles[0]).toBe("Session 30");
    expect(titles.at(-1)).toBe("Session 1");
  });

  it("is empty for a folder Pi has not saved anything for yet", async () => {
    const folder = join(root, "fresh");
    await mkdir(folder, { recursive: true });

    expect(await welcomeHistory(folder)).toEqual([]);
  });
});
