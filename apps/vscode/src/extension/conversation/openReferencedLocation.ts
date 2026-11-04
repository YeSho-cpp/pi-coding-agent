import { basename, isAbsolute, resolve } from "node:path";

import * as vscode from "vscode";

import { resolveReferencePath, startsAtHome } from "../_shared/paths/expandHome.js";
import type { WorkspaceFileSearchOptions } from "../fd/fdArgs.js";
import { WorkspaceFileSearch } from "../fd/WorkspaceFileSearch.js";
import { isRelativeReference, referenceCandidates } from "./sessionPathEvidence.js";

export interface ReferencedLocation {
  path: string;
  line?: number | undefined;
  column?: number | undefined;
  endLine?: number | undefined;
}

/**
 * Deliberately narrower than mention search: no session boosts, no files.exclude
 * config — a linked file should open even when hidden from the explorer.
 */
const FALLBACK_SEARCH_OPTIONS: WorkspaceFileSearchOptions = {
  excludeRules: [],
  respectIgnoreFiles: true,
  followSymlinks: false,
};

/** Candidates are looked up this many at a time, so a slow (remote) file system costs a few round trips. */
const STAT_BATCH = 16;

/**
 * Opens a referenced file and applies its 1-based line/column/endLine.
 * `~/x` and `$HOME/x` mean the home directory, as they do to Pi, so a reference the agent wrote
 * that way opens the real file instead of one under the session's working directory.
 * A directory reference reveals the folder in the Explorer instead of failing to open
 * as a document.
 *
 * A relative reference that does not exist under the session's directory is first looked up
 * where the session's own tool calls were working (`sessionPaths`, newest first): the agent may
 * have read another repository and cited its files relative to that one. Only then does it jump
 * to the best fd match in the workspace (bare filename, stale path); with no match, the
 * original VS Code open error surfaces unchanged.
 */
export async function openReferencedLocation(
  reference: ReferencedLocation,
  basePath?: string,
  sessionPaths?: () => readonly string[],
): Promise<void> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const fsPath = resolveReferencePath(reference.path, basePath ?? workspacePath ?? "");
  const uri = vscode.Uri.file(fsPath);

  const stat = await statOrNull(uri);
  if (stat) return openFound(uri, stat, reference);

  // `~` and absolute references say where they point, so the session's history cannot improve them.
  const known = sessionPaths && isRelativeReference(reference.path) ? sessionPaths() : [];
  const elsewhere = await findAmong(referenceCandidates(reference.path, known), fsPath);
  if (elsewhere) return openFound(elsewhere.uri, elsewhere.stat, reference);

  // The workspace search only knows workspace-relative names, so a home path that is simply
  // missing has nothing to be matched against; the basename search is for stale project paths.
  const match = startsAtHome(reference.path) ? undefined : await findWorkspaceFile(reference.path, basePath ?? workspacePath);
  if (match) return openInEditor(vscode.Uri.file(match), reference);

  // Nothing plausible matched: open the original path anyway so VS Code's
  // "nonexistent file" error is what the user sees.
  return openInEditor(uri, reference);
}

async function openFound(uri: vscode.Uri, stat: vscode.FileStat, reference: ReferencedLocation): Promise<void> {
  if (stat.type & vscode.FileType.Directory) {
    await vscode.commands.executeCommand("revealInExplorer", uri);
    return;
  }
  return openInEditor(uri, reference);
}

/** The first candidate, in the order given, that exists. `skip` is the path already tried. */
async function findAmong(
  candidates: readonly string[],
  skip: string,
): Promise<{ uri: vscode.Uri; stat: vscode.FileStat } | undefined> {
  const pending = candidates.filter((path) => path !== skip);
  for (let start = 0; start < pending.length; start += STAT_BATCH) {
    const batch = pending.slice(start, start + STAT_BATCH).map((path) => vscode.Uri.file(path));
    const stats = await Promise.all(batch.map((candidate) => statOrNull(candidate)));
    const hit = stats.findIndex((stat) => stat !== undefined);
    if (hit >= 0) return { uri: batch[hit]!, stat: stats[hit]! };
  }
  return undefined;
}

/**
 * One-shot fd lookup for a reference that does not exist as given. fd output is
 * workspace-relative, so an absolute reference (typically from another machine
 * or a moved file) can never match as-is; the basename still identifies the
 * file. Best-effort: any failure keeps the caller's original behavior.
 */
async function findWorkspaceFile(
  referencePath: string,
  baseDirectory?: string,
): Promise<string | undefined> {
  if (!baseDirectory) return undefined;
  const query = isAbsolute(referencePath) ? basename(referencePath) : referencePath;
  try {
    const [top] = await new WorkspaceFileSearch().search(
      baseDirectory,
      query,
      1,
      new Set(),
      FALLBACK_SEARCH_OPTIONS,
    );
    return top && !top.isDirectory ? resolve(baseDirectory, top.path) : undefined;
  } catch {
    return undefined;
  }
}

async function statOrNull(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
  try {
    return await vscode.workspace.fs.stat(uri);
  } catch {
    return undefined;
  }
}

async function openInEditor(uri: vscode.Uri, reference: ReferencedLocation): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, { preview: true });
  if (reference.line === undefined) return;

  const start = document.validatePosition(
    new vscode.Position(reference.line - 1, (reference.column ?? 1) - 1),
  );
  const end = reference.endLine === undefined
    ? start
    : document.lineAt(
      document.validatePosition(new vscode.Position(reference.endLine - 1, 0)).line,
    ).range.end;
  editor.selection = new vscode.Selection(start, end);
  editor.revealRange(
    new vscode.Range(start, end),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );
}
