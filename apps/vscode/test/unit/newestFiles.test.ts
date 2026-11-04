import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { newestFiles, newestSessionFiles } from "../../src/extension/sessions/catalog/newestFiles.js";

/**
 * Which of a long listing of session files the welcome history reads decides whether a busy project
 * shows its latest work or its oldest.
 */

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "newest-files-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function make(name: string, modifiedAt: number, folder = directory): Promise<string> {
  const path = join(folder, name);
  await writeFile(path, "{}\n");
  await utimes(path, modifiedAt, modifiedAt);
  return path;
}

describe("newestFiles", () => {
  it("keeps the most recently modified files, newest first", async () => {
    const a = await make("a.jsonl", 1_000);
    const b = await make("b.jsonl", 3_000);
    const c = await make("c.jsonl", 2_000);
    const d = await make("d.jsonl", 4_000);

    expect(await newestFiles([a, b, c, d], 2)).toEqual([d, b]);
  });

  it("ranks by modification time rather than by name, so a resumed old session survives the cut", async () => {
    const resumed = await make("2026-01-01T00-00-00-000Z_resumed.jsonl", 9_000);
    const others = [
      await make("2026-06-01T00-00-00-000Z_a.jsonl", 1_000),
      await make("2026-07-01T00-00-00-000Z_b.jsonl", 2_000),
      await make("2026-08-01T00-00-00-000Z_c.jsonl", 3_000),
    ];

    const kept = await newestFiles([resumed, ...others], 2);

    expect(kept[0]).toBe(resumed);
    expect(kept).toHaveLength(2);
  });

  it("returns a list that already fits untouched, without looking at the files", async () => {
    const paths = [join(directory, "never-created.jsonl"), join(directory, "also-missing.jsonl")];

    expect(await newestFiles(paths, 5)).toEqual(paths);
    expect(await newestFiles(paths, 2)).toEqual(paths);
  });

  it("drops a file that disappeared while ranking", async () => {
    const kept = await make("kept.jsonl", 5_000);
    const other = await make("other.jsonl", 1_000);

    expect(await newestFiles([kept, join(directory, "gone.jsonl"), other], 2)).toEqual([kept, other]);
  });

  it("ranks a long listing correctly even though it is read in several batches", async () => {
    const paths: string[] = [];
    for (let index = 0; index < 150; index += 1) paths.push(await make(`s${String(index).padStart(3, "0")}.jsonl`, 10_000 + index));

    const kept = await newestFiles(paths, 30);

    expect(kept).toHaveLength(30);
    expect(kept[0]).toBe(paths[149]);
    expect(kept.at(-1)).toBe(paths[120]);
  });
});

describe("newestSessionFiles", () => {
  it("reads only session files, from every folder it is given, and skips a folder that is not there", async () => {
    const first = join(directory, "first");
    const second = join(directory, "second");
    await mkdir(first);
    await mkdir(second);
    const a = await make("a.jsonl", 1_000, first);
    const b = await make("b.jsonl", 2_000, second);
    await make("notes.txt", 3_000, first);
    await make("c.jsonl.bak", 3_000, second);

    const files = await newestSessionFiles([first, join(directory, "missing"), second], 10);

    expect([...files].sort()).toEqual([a, b].sort());
  });

  it("keeps the newest files across all the folders, not the first folder's files", async () => {
    const older = join(directory, "older");
    const newer = join(directory, "newer");
    await mkdir(older);
    await mkdir(newer);
    const olderFiles: string[] = [];
    const newerFiles: string[] = [];
    for (let index = 0; index < 6; index += 1) olderFiles.push(await make(`o${index}.jsonl`, 1_000 + index, older));
    for (let index = 0; index < 6; index += 1) newerFiles.push(await make(`n${index}.jsonl`, 5_000 + index, newer));

    const files = await newestSessionFiles([older, newer], 8);

    expect(files).toHaveLength(8);
    expect(files.slice(0, 6)).toEqual([...newerFiles].reverse());
    expect(files.slice(6)).toEqual([olderFiles[5], olderFiles[4]]);
  });

  it("is empty when there are no folders or none of them exist", async () => {
    expect(await newestSessionFiles([], 30)).toEqual([]);
    expect(await newestSessionFiles([join(directory, "nope")], 30)).toEqual([]);
  });
});
