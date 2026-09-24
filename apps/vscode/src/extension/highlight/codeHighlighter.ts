import { homedir } from "node:os";
import { join } from "node:path";

import * as vscode from "vscode";

import { createTextmateHighlighter, type TextmateHighlighter } from "./textmateHighlighter.js";

/**
 * Production wiring for the TextMate highlighter: grammars are read from the user's own VS Code
 * installation (appRoot + user extension folders) so tokens match the editor, and the Oniguruma
 * wasm lives next to this bundle (`dist/extension/onig.wasm`) — node has no webview CSP, so the
 * engine runs here instead of in the webview.
 *
 * Any failure resolves to null forever; the webview keeps the highlight.js first pass.
 */
let highlighterPromise: Promise<TextmateHighlighter | null> | null = null;

function grammarRoots(): string[] {
  const home = homedir();
  return [
    join(vscode.env.appRoot, "extensions"),
    join(home, ".vscode", "extensions"),
    join(home, ".vscode-insiders", "extensions"),
    join(home, ".cursor", "extensions"),
  ];
}

export function highlightFence(lang: string, code: string): Promise<string | null> {
  if (!highlighterPromise) {
    highlighterPromise = createTextmateHighlighter({
      wasmPath: join(__dirname, "onig.wasm"),
      roots: grammarRoots(),
    }).then((instance) => instance);
    highlighterPromise = highlighterPromise.catch(() => null);
  }
  return highlighterPromise
    .then((instance) => (instance ? instance.highlight(lang, code) : null))
    .catch((): string | null => null);
}
