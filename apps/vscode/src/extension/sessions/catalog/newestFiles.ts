import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** Files stat-ed at the same time while ranking a long listing. */
const STAT_BATCH = 64;

/**
 * The `limit` most recently modified Pi session files (`*.jsonl`) in the folders `roots`, newest first.
 *
 * `readdir` lists names in ascending order and Pi names a session file by its creation time, so cutting
 * a listing short keeps the oldest sessions and hides the latest. A resumed session keeps its original
 * name but is written to again, so the modification time is what says how recent a session is.
 */
export async function newestSessionFiles(roots: readonly string[], limit: number): Promise<string[]> {
  const paths: string[] = [];
  for (const root of roots) {
    try {
      for (const name of await readdir(root)) {
        if (name.endsWith(".jsonl")) paths.push(join(root, name));
      }
    } catch {
      /* a folder Pi has not saved anything for yet does not exist */
    }
  }
  return newestFiles(paths, limit);
}

/**
 * The `limit` most recently modified of `paths`, newest first. A list that already fits is returned as
 * given: no file needs ranking, and the caller sorts by the timestamps it reads anyway.
 */
export async function newestFiles(paths: readonly string[], limit: number): Promise<string[]> {
  if (paths.length <= limit) return [...paths];

  const stamped: { path: string; mtimeMs: number }[] = [];
  for (let start = 0; start < paths.length; start += STAT_BATCH) {
    const batch = await Promise.all(paths.slice(start, start + STAT_BATCH).map(async (path) => {
      try {
        return { path, mtimeMs: (await stat(path)).mtimeMs };
      } catch {
        return null;
      }
    }));
    for (const entry of batch) if (entry) stamped.push(entry);
  }
  return stamped
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((entry) => entry.path);
}
