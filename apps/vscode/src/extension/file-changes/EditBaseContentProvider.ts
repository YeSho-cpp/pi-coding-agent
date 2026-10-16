import { relative } from "node:path";

import * as vscode from "vscode";

import { getEditBaseSnapshot } from "./editBaseSnapshots.js";

export const EDIT_BASE_SCHEME = "pi-edit-base";

export class EditBaseContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    const id = new URLSearchParams(uri.query).get("id") ?? "";
    return getEditBaseSnapshot(id)?.base ?? "";
  }

  dispose(): void {
    /* nothing to release: snapshots live in the module cache */
  }
}

/**
 * Two-pane diff of "the file just before this edit" against the current working tree.
 * Returns false when the snapshot is gone (window reload, long-ago turn) so the caller
 * can fall back to the Git HEAD view.
 */
export async function openEditBaseDiff(filePath: string, toolCallId: string): Promise<boolean> {
  const snapshot = getEditBaseSnapshot(toolCallId);
  if (!snapshot) return false;

  const fileUri = vscode.Uri.file(filePath);
  const folder = vscode.workspace.getWorkspaceFolder(fileUri) ?? vscode.workspace.workspaceFolders?.[0];
  const relativePath = folder
    ? relative(folder.uri.fsPath, fileUri.fsPath).replaceAll("\\", "/")
    : fileUri.path;
  const baseUri = vscode.Uri.from({
    scheme: EDIT_BASE_SCHEME,
    path: fileUri.path,
    query: new URLSearchParams({ id: toolCallId }).toString(),
  });
  await vscode.commands.executeCommand("vscode.diff", baseUri, fileUri, `${relativePath} (AI edit ↔ current)`);
  return true;
}
