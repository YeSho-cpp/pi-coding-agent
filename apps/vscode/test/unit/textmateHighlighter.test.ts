import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  colorizeUnscopedIdentifiers,
  createTextmateHighlighter,
  type TextmateHighlighter,
} from "../../src/extension/highlight/textmateHighlighter.js";

/**
 * Drives the real pipeline — vscode-textmate + Oniguruma — against a fixture grammar, the same
 * way production runs it against the grammars discovered under the user's VS Code install.
 * The point of the exercise is the class this suite can assert and highlight.js cannot paint:
 * identifiers get a colour.
 */

const require_ = createRequire(import.meta.url);

describe("createTextmateHighlighter", () => {
  let highlighter: TextmateHighlighter;

  beforeAll(async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "frostui-tm-"));
    const extensionRoot = join(fixtureRoot, "fixture-ext");
    mkdirSync(extensionRoot, { recursive: true });
    writeFileSync(
      join(extensionRoot, "package.json"),
      JSON.stringify({
        name: "fixture-ext",
        version: "0.0.1",
        contributes: {
          languages: [{ id: "fixture", aliases: ["fixt"] }],
          grammars: [
            { language: "fixture", scopeName: "source.fixture", path: "./fixture.tmLanguage.json" },
          ],
        },
      }),
      "utf8",
    );
    writeFileSync(
      join(extensionRoot, "fixture.tmLanguage.json"),
      JSON.stringify({
        scopeName: "source.fixture",
        patterns: [
          { name: "comment.line.fixture", match: "//.*$" },
          { name: "keyword.control.fixture", match: "\\b(if|else)\\b" },
          { name: "variable.other.fixture", match: "[A-Za-z_][A-Za-z0-9_]*" },
        ],
      }),
      "utf8",
    );
    highlighter = await createTextmateHighlighter({
      wasmPath: require_.resolve("vscode-oniguruma/release/onig.wasm"),
      roots: [fixtureRoot],
    });
  });

  it("colours identifiers — the case highlight.js leaves white", () => {
    const html = highlighter.highlight("fixture", "foo // note");
    expect(html).toContain('<span class="hljs-variable">foo</span>');
    expect(html).toContain('<span class="hljs-comment">// note</span>');
  });

  it("colours keywords", () => {
    const html = highlighter.highlight("fixture", "if");
    expect(html).toContain('<span class="hljs-keyword">if</span>');
  });

  it("resolves fence aliases declared by the language contribution", () => {
    const html = highlighter.highlight("fixt", "else");
    expect(html).toContain('<span class="hljs-keyword">else</span>');
  });

  it("returns null for a language no grammar declares", () => {
    expect(highlighter.highlight("nope-lang", "if x")).toBeNull();
  });

  it("refuses oversized input instead of stalling the host", () => {
    expect(highlighter.highlight("fixture", "x".repeat(500_001))).toBeNull();
  });
});

describe("createTextmateHighlighter against the installed VS Code grammars", () => {
  // Runs only where the real grammars exist (a dev machine); CI runners skip it.
  const appRoot = "/Applications/Visual Studio Code.app/Contents/Resources/app";
  const itLocal = existsSync(join(appRoot, "extensions")) ? it : it.skip;

  itLocal("colours the identifiers highlight.js leaves white, from the editor's own C grammar", async () => {
    const real = await createTextmateHighlighter({
      wasmPath: require_.resolve("vscode-oniguruma/release/onig.wasm"),
      roots: [join(appRoot, "extensions")],
    });
    const sample = "if ((sock->asyncFlag || sock->abortFlag) && sock->fd >= 0) {\n  fcntl(sock->fd, F_SETFL, flags);\n}";
    const html = real.highlight("c", sample);

    expect(html).not.toBeNull();
    expect(html).toContain('<span class="hljs-keyword">if</span>');
    // The original complaint: member identifiers stayed plain white next to Copilot's blue.
    expect(html).toMatch(/<span class="hljs-(?:property|variable|title)[^"]*">asyncFlag<\/span>/);
    expect(html).toMatch(/<span class="hljs-[a-z_]+">fcntl<\/span>/);
  });
});

describe("colorizeUnscopedIdentifiers", () => {
  it("wraps bare identifiers — the runs VS Code's C grammar leaves unscoped", () => {
    expect(colorizeUnscopedIdentifiers("sock->fd")).toBe(
      '<span class="hljs-variable">sock</span>-&gt;<span class="hljs-variable">fd</span>',
    );
    expect(colorizeUnscopedIdentifiers("O_NONBLOCK")).toContain('<span class="hljs-variable">O_NONBLOCK</span>');
  });

  it("leaves pure numbers and escapes markup in the surrounding text", () => {
    expect(colorizeUnscopedIdentifiers("42")).toBe("42");
    expect(colorizeUnscopedIdentifiers("a<b && c")).toBe(
      '<span class="hljs-variable">a</span>&lt;<span class="hljs-variable">b</span> &amp;&amp; <span class="hljs-variable">c</span>',
    );
  });
});

