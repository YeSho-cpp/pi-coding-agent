import * as vscode from "vscode";

import type { ContextAttachItemView } from "../../../shared/model/contextAttachModel.js";
import type { WorkspaceFileSearchOptions } from "../../fd/fdArgs.js";
import { formatFileMention } from "./formatFileMention.js";
import { materialIconDataUri, materialQuickPickIcon } from "./materialIcons.js";

export function contextId(prefix = "ctx"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${rand}`;
}

function chipIcon(pathOrName: string, isDirectory: boolean): { iconDataUri?: string } {
  const uri = materialIconDataUri(pathOrName, isDirectory);
  return uri ? { iconDataUri: uri } : {};
}

/** Active editor file / selection → context chip items (path refs only). */
export function captureContextItems(kind: "file" | "selection"): ContextAttachItemView[] {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== "file") return [];
  const relative = vscode.workspace.asRelativePath(editor.document.uri, false);
  const baseName = relative.split("/").pop() || relative;

  if (kind === "file") {
    return [{
      id: contextId(),
      kind: "file",
      path: relative,
      label: baseName,
      insertText: formatFileMention(relative),
      ...chipIcon(baseName, false),
    }];
  }

  const start = editor.selection.start.line + 1;
  const end = editor.selection.isEmpty ? start : editor.selection.end.line + 1;
  return [{
    id: contextId(),
    kind: "selection",
    path: relative,
    startLine: start,
    endLine: end,
    label: `${baseName}:${start}-${end}`,
    insertText: formatFileMention(relative, { start, end }),
    ...chipIcon(baseName, false),
  }];
}

export async function captureContextItemsForHint(kind: "file" | "selection"): Promise<ContextAttachItemView[]> {
  return captureContextItems(kind);
}

/**
 * VS Code QuickPick multi-select for workspace files/folders.
 * Returns [] on cancel; on accept uses selectedItems, then activeItems[0] (Enter on focused row).
 */
export async function pickContextItemsQuickPick(
  search: (
    cwd: string,
    query: string,
    limit: number,
    boosts: ReadonlySet<string>,
    options: WorkspaceFileSearchOptions,
  ) => Promise<Array<{ path: string; name: string; directory: string; isDirectory: boolean }>>,
  cwd: string,
  mode: "filesAndFolders" | "folder" | "files",
): Promise<ContextAttachItemView[]> {
  const quickPick = vscode.window.createQuickPick();
  quickPick.title = mode === "folder" ? "选择文件夹" : "按名称搜索文件或文件夹";
  quickPick.placeholder =
    mode === "folder"
      ? "搜索文件夹… Enter 确认"
      : mode === "files"
        ? "搜索文件… Enter 确认"
        : "搜索文件/文件夹… 勾选或选中后 Enter 确认";
  quickPick.canSelectMany = true;
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.ignoreFocusOut = true;

  type Row = vscode.QuickPickItem & {
    candidate?: { path: string; name: string; isDirectory: boolean };
  };

  let version = 0;
  let cachedRows: Row[] = [];

  const toRow = (item: { path: string; name: string; directory: string; isDirectory: boolean }): Row => {
    const path = item.isDirectory && !item.path.endsWith("/") ? `${item.path}/` : item.path;
    const name = item.isDirectory ? `${item.name}/` : item.name;
    return {
      label: name,
      description: item.directory && item.directory !== "." ? item.directory : ".",
      detail: path,
      iconPath: materialQuickPickIcon(item.name, item.isDirectory),
      alwaysShow: true,
      candidate: { path, name, isDirectory: item.isDirectory },
    };
  };

  const toItem = (row: Row): ContextAttachItemView | null => {
    const c = row.candidate;
    if (!c) return null;
    return {
      id: contextId(),
      kind: c.isDirectory ? "folder" : "file",
      path: c.path,
      label: c.name,
      insertText: formatFileMention(c.path),
      ...chipIcon(c.name, c.isDirectory),
    };
  };

  const refresh = (query: string): void => {
    const token = ++version;
    quickPick.busy = true;
    void Promise.resolve(
      search(cwd, query, 80, new Set(), {
        excludeRules: [],
        respectIgnoreFiles: true,
        followSymlinks: false,
      }),
    )
      .then(async (results) => {
        if (token !== version) return;
        let filtered = results.filter((item) => {
          if (mode === "folder") return item.isDirectory;
          if (mode === "files") return !item.isDirectory;
          return true;
        });
        // Fallback when fd/search is empty — still list workspace files via VS Code API.
        if (!filtered.length && !query.trim() && mode !== "folder") {
          try {
            const uris = await vscode.workspace.findFiles(
              "**/*",
              "**/node_modules/**",
              120,
            );
            filtered = uris
              .filter((u) => u.scheme === "file")
              .map((u) => {
                const rel = vscode.workspace.asRelativePath(u, false);
                const parts = rel.split("/");
                return {
                  path: rel,
                  name: parts[parts.length - 1] || rel,
                  directory: parts.slice(0, -1).join("/"),
                  isDirectory: false,
                };
              });
          } catch { /* ignore */ }
        }
        if (token !== version) return;
        cachedRows = filtered.map(toRow);
        quickPick.items = cachedRows;
        quickPick.busy = false;
      })
      .catch(() => {
        if (token === version) {
          quickPick.busy = false;
          quickPick.items = [];
        }
      });
  };

  refresh("");

  return await new Promise<ContextAttachItemView[]>((resolve) => {
    let settled = false;
    const finish = (items: ContextAttachItemView[], reason: "accept" | "cancel"): void => {
      if (settled) return;
      settled = true;
      try { quickPick.dispose(); } catch { /* ignore */ }
      resolve(reason === "accept" ? items : []);
    };

    quickPick.onDidChangeValue((value) => refresh(value));
    quickPick.onDidAccept(() => {
      // Multi-select: checked rows. Single focus + Enter: activeItems[0].
      const selected = quickPick.selectedItems as Row[];
      const rows = selected.length
        ? selected
        : quickPick.activeItems?.length
          ? [quickPick.activeItems[0] as Row]
          : [];
      const items = rows.map(toItem).filter(Boolean) as ContextAttachItemView[];
      finish(items, "accept");
    });
    quickPick.onDidHide(() => finish([], "cancel"));
    quickPick.show();
  });
}
