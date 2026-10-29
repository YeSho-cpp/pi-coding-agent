import { describe, expect, it } from "vitest";
import { parseBashFileRead } from "../../src/webview/features/conversation/bashFileRead";
import { languageForPath } from "../../src/webview/features/conversation/codeLanguage";

describe("parseBashFileRead", () => {
  it("reads a sed line range", () => {
    expect(parseBashFileRead("sed -n '900,935p' internal/foo.go")).toEqual({
      path: "internal/foo.go",
      startLine: 900,
      endLine: 935,
    });
    expect(parseBashFileRead("sed -n 12p a.go")).toEqual({ path: "a.go", startLine: 12, endLine: 12 });
    expect(parseBashFileRead("sed -n '40,$p' a.go")).toEqual({ path: "a.go", startLine: 40 });
  });

  it("joins a leading cd onto a relative path", () => {
    expect(parseBashFileRead("cd /x/y && sed -n 1,5p rel/a.go")).toEqual({
      path: "/x/y/rel/a.go",
      startLine: 1,
      endLine: 5,
    });
    expect(parseBashFileRead("cd /x; cat ./a.go")).toEqual({ path: "/x/a.go" });
    expect(parseBashFileRead("cd /x && cat /abs/a.go")).toEqual({ path: "/abs/a.go" });
  });

  it("reads cat, head and tail", () => {
    expect(parseBashFileRead("cat src/a.ts")).toEqual({ path: "src/a.ts" });
    expect(parseBashFileRead("head -n 20 a.py")).toEqual({ path: "a.py", startLine: 1, endLine: 20 });
    expect(parseBashFileRead("head -20 a.py")).toEqual({ path: "a.py", startLine: 1, endLine: 20 });
    expect(parseBashFileRead("head a.py")).toEqual({ path: "a.py", startLine: 1, endLine: 10 });
    expect(parseBashFileRead("tail -n 5 a.log")).toEqual({ path: "a.log" });
    expect(parseBashFileRead("cat 'my file.txt'")).toEqual({ path: "my file.txt" });
  });

  it("refuses anything that is not a plain single-file read", () => {
    for (const command of [
      "cat a.go | head",
      "cat a.go > b.go",
      "cat *.go",
      "cat $FILE",
      "grep foo a.go",
      "cat a.go && rm b.go",
      "cd /x && cd /y && cat a.go",
      "cd -P /x && cat a.go",
      "cat a.go b.go",
      "cat",
      "sed -n 'p' a.go",
      "sed -n '9,3p' a.go",
      "sed -i 's/a/b/' a.go",
      "head -n x a.go",
      "cat 'unbalanced",
      "cat \"$HOME/a\"",
      "",
    ]) {
      expect(parseBashFileRead(command), command).toBeNull();
    }
  });
});

describe("languageForPath", () => {
  it("maps extensions and well-known file names", () => {
    expect(languageForPath("a/b/main.go")).toBe("go");
    expect(languageForPath("x.TS")).toBe("typescript");
    expect(languageForPath("/p/Makefile")).toBe("makefile");
    expect(languageForPath("Dockerfile")).toBe("dockerfile");
    expect(languageForPath("Cargo.toml")).toBe("ini");
  });

  it("returns null when unknown", () => {
    expect(languageForPath("notes.xyz")).toBeNull();
    expect(languageForPath("LICENSE")).toBeNull();
  });
});
