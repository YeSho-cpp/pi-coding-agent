import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTwoFilesPatch } from "diff";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearEditBaseSnapshots,
  getEditBaseSnapshot,
  recordEditBaseFromResult,
  resolveEditToolPath,
} from "../../src/extension/file-changes/editBaseSnapshots";

const OLD = Array.from({ length: 12 }, (_, index) => `line${index + 1}`).join("\n") + "\n";
const NEW = OLD.replace("line5", "line5-EDITED");

function piStylePatch(): string {
  // Same shape Pi's generateUnifiedPatch emits (context: 4); the Index header is only
  // cosmetic and parsePatch accepts plain ---/+++ headers too.
  return createTwoFilesPatch("f.txt", "f.txt", OLD, NEW, undefined, undefined, { context: 4 });
}

describe("resolveEditToolPath", () => {
  it("resolves relative paths against the session cwd and keeps absolute ones", () => {
    expect(resolveEditToolPath("sub/f.txt", "/session")).toBe("/session/sub/f.txt");
    expect(resolveEditToolPath("/abs/f.txt", "/session")).toBe("/abs/f.txt");
  });
});

describe("editBaseSnapshots", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    clearEditBaseSnapshots();
    dir = await mkdtemp(join(tmpdir(), "pi-edit-base-"));
    file = join(dir, "f.txt");
  });

  afterEach(() => {
    clearEditBaseSnapshots();
  });

  it("reconstructs the pre-edit content by reverse-applying the tool's patch", async () => {
    await writeFile(file, NEW, "utf8");

    await recordEditBaseFromResult("call-1", file, { details: { patch: piStylePatch() } });

    expect(getEditBaseSnapshot("call-1")).toEqual({ path: file, base: OLD });
  });

  it("reconstructs from a Pi-style patch that carries the Index header", async () => {
    await writeFile(file, NEW, "utf8");
    const indexed = `Index: f.txt\n${"=".repeat(71)}\n${piStylePatch()}`;

    await recordEditBaseFromResult("call-index", file, { details: { patch: indexed } });

    expect(getEditBaseSnapshot("call-index")?.base).toBe(OLD);
  });

  it("ignores relative paths, failed patches, and results without a patch", async () => {
    await writeFile(file, NEW, "utf8");

    await recordEditBaseFromResult("rel", "relative/f.txt", { details: { patch: piStylePatch() } });
    await recordEditBaseFromResult("bad", file, { details: { patch: "--- x\n+++ x\n@@ -99 +99 @@\n-nope\n+nope\n" } });
    await recordEditBaseFromResult("none", file, { details: {} });

    expect(getEditBaseSnapshot("rel")).toBeUndefined();
    expect(getEditBaseSnapshot("bad")).toBeUndefined();
    expect(getEditBaseSnapshot("none")).toBeUndefined();
  });

  it("evicts the least recently used snapshot beyond the cap", async () => {
    for (let index = 0; index < 51; index += 1) {
      const path = join(dir, `f${index}.txt`);
      await writeFile(path, NEW, "utf8");
      await recordEditBaseFromResult(`call-${index}`, path, { details: { patch: piStylePatch() } });
    }

    expect(getEditBaseSnapshot("call-0")).toBeUndefined();
    expect(getEditBaseSnapshot("call-50")).toBeDefined();
  });
});
