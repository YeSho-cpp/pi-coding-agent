import { basename, relative, resolve, sep } from "node:path";

import type { SessionWorkingDirectory } from "./SessionWorkingDirectories.js";

export interface PlannedNewSessionDirectory {
  kind: "workspace" | "project" | "worktree";
  directory: SessionWorkingDirectory;
}

export interface PlanNewSessionInput {
  /** Every open workspace folder, in display order. */
  folderCwds: readonly string[];
  /** Per-folder discovery results (current root first, then that folder's worktrees). */
  discoveries: readonly { folderCwd: string; directories: readonly SessionWorkingDirectory[] }[];
  /** cwds seen in records, catalog history, and remembered directories. */
  knownCwds: readonly string[];
  isDirectory?: (path: string) => Promise<boolean>;
}

/** True when `child` sits under `parent` (strictly, or equal). */
export function isInsideDirectory(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(rel));
}

/**
 * Candidates for the new-session picker, grouped in render order:
 * workspace folders (VS Code terminal-picker style), then project directories already
 * used by sessions (OpenChamber-style natural scoping), then the remaining worktrees.
 */
export async function planNewSessionDirectories(input: PlanNewSessionInput): Promise<PlannedNewSessionDirectory[]> {
  const planned: PlannedNewSessionDirectory[] = [];
  const seen = new Set<string>();
  const mark = (cwd: string): boolean => {
    const key = resolve(cwd);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  for (const { directories } of input.discoveries) {
    for (const directory of directories) {
      if (!mark(directory.cwd)) continue;
      planned.push({ kind: directory.isCurrent ? "workspace" : "worktree", directory });
    }
  }

  for (const raw of input.knownCwds) {
    const cwd = resolve(raw);
    if (!mark(cwd)) continue;
    // Only directories under an open folder qualify; anything else is another window's
    // business and would only clutter the picker.
    const owner = input.folderCwds.find((folder) => isInsideDirectory(folder, cwd) && resolve(folder) !== cwd);
    if (!owner) continue;
    if (input.isDirectory && !await input.isDirectory(cwd)) continue;
    planned.push({
      kind: "project",
      directory: {
        cwd,
        workspaceFolderCwd: resolve(owner),
        directoryName: basename(cwd),
        isCurrent: false,
      },
    });
  }

  // Render order: every workspace root, then projects, then worktrees — the picker draws
  // separators on kind changes and keeps the first entry selectable without a leading rule.
  const rank: Record<PlannedNewSessionDirectory["kind"], number> = { workspace: 0, project: 1, worktree: 2 };
  return planned.sort((left, right) => rank[left.kind] - rank[right.kind]);
}
