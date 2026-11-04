import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { AgentTurnItemView, ConversationItemView } from "../../src/shared/model/conversationModel.js";
import type { ToolCallView } from "../../src/shared/model/toolCallModel.js";
import {
  commandPaths,
  isRelativeReference,
  referenceCandidates,
  sessionToolPaths,
} from "../../src/extension/conversation/sessionPathEvidence.js";

/**
 * A reference the agent wrote relative to another repository (`tests/elastic/test_ep.py` after
 * `cd ../DeepEP`) cannot be placed from the session's own directory. These tests pin how the
 * session's tool calls are read back as evidence of where such a reference points.
 *
 * Paths go through `resolve` so the expectations hold on Windows too, where `/work` gets a drive.
 */

const CWD = resolve("/work/HPN/mori");
const DEEPEP = resolve("/work/HPN/DeepEP");
const at = (...parts: string[]): string => resolve(DEEPEP, ...parts);

function bound(name: string, args: Record<string, unknown>): ToolCallView {
  return { state: "bound", id: `${name}-1`, name, label: name, status: "complete", isError: false, startedAt: 0, args };
}

function tool(name: string, args: Record<string, unknown>): AgentTurnItemView {
  return { id: `tool-${name}`, type: "tool", tool: bound(name, args), timestamp: 0 };
}

function turn(...items: AgentTurnItemView[]): ConversationItemView {
  return { id: "turn", type: "turn", items, status: "completed", startedAt: 0 };
}

describe("commandPaths", () => {
  it("places a relative file in the directory the command changed into", () => {
    expect(commandPaths("cd /work/HPN/DeepEP && sed -n 1,120p tests/elastic/test_ep.py", CWD)).toEqual([
      DEEPEP,
      at("tests/elastic/test_ep.py"),
    ]);
  });

  it("follows a relative cd from the session's directory", () => {
    expect(commandPaths("cd ../DeepEP && cat csrc/kernels/elastic/dispatch.hpp", CWD)).toEqual([
      DEEPEP,
      at("csrc/kernels/elastic/dispatch.hpp"),
    ]);
  });

  it("chains cd commands, each relative to the one before", () => {
    expect(commandPaths("cd /work/a && cd b && cat c.ts", CWD)).toEqual([
      resolve("/work/a"),
      resolve("/work/a/b"),
      resolve("/work/a/b/c.ts"),
    ]);
  });

  it("keeps the directory across statements separated by ; and newlines", () => {
    expect(commandPaths("cd /work/a; ls src/x.ts\ncat y.ts", CWD)).toEqual([
      resolve("/work/a"),
      resolve("/work/a/src/x.ts"),
      resolve("/work/a/y.ts"),
    ]);
  });

  it.each(["~/proj", "$HOME/proj", "${HOME}/proj"])("expands %s to the home directory", (target) => {
    expect(commandPaths(`cd ${target} && cat notes.md`, CWD)).toEqual([
      resolve(homedir(), "proj"),
      resolve(homedir(), "proj", "notes.md"),
    ]);
  });

  it("reads quoted paths with spaces as one word", () => {
    expect(commandPaths(`cd "/work/my repo" && ls 'src/a b.ts'`, CWD)).toEqual([
      resolve("/work/my repo"),
      resolve("/work/my repo/src/a b.ts"),
    ]);
  });

  it("still finds the files of a command that pipes into another", () => {
    expect(commandPaths("cd /work/r && grep -rn foo --include=*.py src/a.py tests/b.py | head -5", CWD)).toEqual([
      resolve("/work/r"),
      resolve("/work/r/src/a.py"),
      resolve("/work/r/tests/b.py"),
    ]);
  });

  it("takes the directory of git -C and places the words after it there", () => {
    expect(commandPaths("git -C /work/other log -3 -- src/x.ts", CWD)).toEqual([
      resolve("/work/other"),
      resolve("/work/other/src/x.ts"),
    ]);
  });

  it("passes absolute paths through unchanged and normalises them", () => {
    expect(commandPaths("sed -n 1,5p /work/HPN/DeepEP/./tests/../tests/elastic/test_ep.py", CWD)).toEqual([
      at("tests/elastic/test_ep.py"),
    ]);
  });

  it("skips anything the shell would have to expand", () => {
    expect(commandPaths("cd $WORKDIR && cat $(pwd)/x.ts *.ts src/{a,b}.ts `which x`/y.ts", CWD)).toEqual([]);
  });

  it("does not take options, URLs, assignments or plain words for paths", () => {
    expect(
      commandPaths("curl -fsSL https://example.com/a.sh -o out.sh && env FOO=/work/x/y run --path=/work/z build", CWD),
    ).toEqual([resolve(CWD, "out.sh")]);
  });

  it("keeps at most 40 paths of one command", () => {
    const command = `cat ${Array.from({ length: 100 }, (_, index) => `f${index}.ts`).join(" ")}`;
    expect(commandPaths(command, CWD)).toHaveLength(40);
  });

  it("survives an unterminated quote", () => {
    expect(commandPaths(`cd /work/a && cat "src/x.ts`, CWD)).toEqual([resolve("/work/a"), resolve("/work/a/src/x.ts")]);
  });
});

describe("sessionToolPaths", () => {
  it("lists the newest tool call's paths first and each path once", () => {
    const items = [
      turn(tool("read", { path: "/work/a/x.ts" })),
      turn(tool("bash", { command: "cd /work/b && cat y.ts" }), tool("edit", { path: "/work/a/x.ts" })),
    ];

    expect(sessionToolPaths(items, CWD)).toEqual([
      resolve("/work/a/x.ts"),
      resolve("/work/b/y.ts"),
      resolve("/work/b"),
    ]);
  });

  it.each(["path", "file_path", "filePath", "filename"])("reads the %s argument of a file tool", (key) => {
    expect(sessionToolPaths([turn(tool("read", { [key]: "/work/a/x.ts" }))], CWD)).toEqual([resolve("/work/a/x.ts")]);
  });

  it("places a relative tool path in the session's directory and expands ~", () => {
    const items = [turn(tool("read", { path: "src/x.ts" }), tool("read", { path: "~/notes/todo.md" }))];

    expect(sessionToolPaths(items, CWD)).toEqual([resolve(homedir(), "notes/todo.md"), resolve(CWD, "src/x.ts")]);
  });

  it("ignores tools still preparing, annotations and tools with nothing path-like", () => {
    const items: ConversationItemView[] = [
      { id: "note", type: "notice", text: "cd /work/a && cat x.ts", level: "info", timestamp: 0 },
      turn(
        { id: "t1", type: "tool", timestamp: 0, tool: { state: "preparing", status: "running", isError: false, startedAt: 0, rawArguments: '{"path":"/work/a/x.ts"}' } },
        tool("todo", { items: ["a", "b"] }),
        tool("bash", { command: "echo hello" }),
      ),
    ];

    expect(sessionToolPaths(items, CWD)).toEqual([]);
  });

  it("stops after 200 paths", () => {
    const calls = Array.from({ length: 300 }, (_, index) => tool("read", { path: `/work/a/f${index}.ts` }));

    expect(sessionToolPaths([turn(...calls)], CWD)).toHaveLength(200);
  });

  it("reads the commands Pi ran for the file chips in the reported session", () => {
    const items = [
      turn(
        tool("bash", { command: "cd /work/HPN/DeepEP && sed -n 1,120p tests/elastic/test_ep.py" }),
        tool("bash", { command: 'cd /work/HPN/DeepEP && grep -rn "do_cpu_sync" --include=*.py deep_ep/ tests/elastic/test_ep.py | head -20' }),
        tool("bash", { command: "cd /work/HPN/DeepEP && sed -n 88,175p csrc/kernels/elastic/dispatch.hpp" }),
      ),
    ];

    expect(sessionToolPaths(items, CWD)).toEqual(
      expect.arrayContaining([DEEPEP, at("tests/elastic/test_ep.py"), at("csrc/kernels/elastic/dispatch.hpp"), at("deep_ep")]),
    );
  });
});

describe("referenceCandidates", () => {
  const HOME = resolve("/home/ada");

  it("proposes the named path that ends with the reference first", () => {
    const known = [at("csrc"), at("tests/elastic/test_ep.py")];

    expect(referenceCandidates("tests/elastic/test_ep.py", known, HOME)[0]).toBe(at("tests/elastic/test_ep.py"));
  });

  it("matches a bare file name against the end of a named path", () => {
    expect(referenceCandidates("test_ep.py", [at("tests/elastic/test_ep.py")], HOME)[0]).toBe(at("tests/elastic/test_ep.py"));
  });

  it("matches whole path segments only", () => {
    const candidates = referenceCandidates("test_ep.py", [at("tests/xtest_ep.py")], HOME);

    expect(candidates).not.toContain(at("tests/xtest_ep.py"));
  });

  it("proposes the reference under every ancestor of a named path", () => {
    const candidates = referenceCandidates("csrc/kernels/elastic/dispatch.hpp", [at("tests/elastic/test_ep.py")], HOME);

    expect(candidates).toContain(at("csrc/kernels/elastic/dispatch.hpp"));
  });

  it("proposes a named directory itself as a root", () => {
    expect(referenceCandidates("tests/x.py", [DEEPEP], HOME)).toContain(at("tests/x.py"));
  });

  it("lists exact matches before roots and the newest evidence first", () => {
    const newer = resolve("/work/B/tests/x.py");
    const older = resolve("/work/A/tests/x.py");

    const candidates = referenceCandidates("tests/x.py", [newer, older], HOME);

    expect(candidates.slice(0, 2)).toEqual([newer, older]);
  });

  it("never uses the home directory or the filesystem root as a root", () => {
    const candidates = referenceCandidates("notes.md", [resolve(HOME, "proj/src/a.ts")], HOME);

    expect(candidates).not.toContain(resolve(HOME, "notes.md"));
    expect(candidates).not.toContain(resolve("/notes.md"));
    expect(candidates).toContain(resolve(HOME, "proj/notes.md"));
  });

  it("climbs a bounded number of ancestors", () => {
    const deep = resolve("/a/b/c/d/e/f/g/h/i/j/file.ts");

    const candidates = referenceCandidates("README.md", [deep], HOME);

    expect(candidates).toContain(resolve("/a/b/c/d/e/f/g/h/i/j/README.md"));
    expect(candidates).not.toContain(resolve("/a/b/README.md"));
  });

  it("lists each candidate once and at most 160", () => {
    const known = Array.from({ length: 150 }, (_, index) => resolve(`/work/p${index}/a/b/c/file.ts`));

    const candidates = referenceCandidates("x.ts", known, HOME);

    expect(candidates).toHaveLength(160);
    expect(new Set(candidates).size).toBe(160);
  });

  it.each([
    ["an absolute path", resolve("/elsewhere/x.ts")],
    ["a home path", "~/x.ts"],
    ["a $HOME path", "$HOME/x.ts"],
    ["a parent reference", "../DeepEP/x.ts"],
    ["an empty reference", "./"],
  ])("makes no guess for %s", (_label, reference) => {
    expect(referenceCandidates(reference, [at("tests/elastic/test_ep.py"), DEEPEP], HOME)).toEqual([]);
  });

  it("normalises ./ and backslashes in the reference", () => {
    expect(referenceCandidates(".\\tests\\elastic\\test_ep.py", [at("tests/elastic/test_ep.py")], HOME)[0]).toBe(
      at("tests/elastic/test_ep.py"),
    );
    expect(referenceCandidates("./tests/x.py", [DEEPEP], HOME)).toContain(join(DEEPEP, "tests", "x.py"));
  });
});

describe("isRelativeReference", () => {
  it.each<[string, boolean]>([
    ["tests/elastic/test_ep.py", true],
    ["test_ep.py", true],
    ["./src/a.ts", true],
    ["../a.ts", false],
    ["~/a.ts", false],
    ["$HOME/a.ts", false],
    [resolve("/abs/a.ts"), false],
  ])("%s -> %s", (reference, expected) => {
    expect(isRelativeReference(reference)).toBe(expected);
  });
});
