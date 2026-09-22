import * as vscode from "vscode";

import { formatFileMention } from "./formatFileMention.js";

/** Active selection or, if empty, the current line — path and line range only. */
export function captureActiveSelection(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== "file") return undefined;
  // Absolute: Pi resolves the reference against the session cwd, which may be another folder.
  const fsPath = editor.document.uri.fsPath;
  if (editor.selection.isEmpty) {
    const line = editor.selection.active.line + 1;
    return formatFileMention(fsPath, { start: line, end: line });
  }
  const start = editor.selection.start.line + 1;
  const end = editor.selection.end.line + 1;
  return formatFileMention(fsPath, { start, end });
}
