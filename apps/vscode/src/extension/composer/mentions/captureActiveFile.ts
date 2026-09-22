import * as vscode from "vscode";

import { formatFileMention } from "./formatFileMention.js";

export function captureActiveFileReference(): string | undefined {
  const document = vscode.window.activeTextEditor?.document;
  if (!document || document.uri.scheme !== "file") return undefined;
  // Absolute: Pi resolves the reference against the session cwd, which may be another folder.
  return formatFileMention(document.uri.fsPath);
}
