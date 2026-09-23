import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as vscode from "vscode";

import { BUNDLED_ICONS } from "./bundledIcons.js";
import { iconMimeType, iconSources, type IconThemeJson } from "./fileIconResolve.js";

/**
 * Context-chip icons, in the reader's own terms: follow whichever file icon theme VS Code has
 * active (Material, vscode-icons, …), and when none is usable — including the default Seti,
 * which draws from a font instead of files — fall back to the bundled MIT subset. Both ends
 * degrade to the plain codicon, so an icon always renders.
 *
 * Only the theme's *files* are read; whether the theme is selected as the explorer's icon theme
 * is what `workbench.iconTheme` says, and nothing here changes it.
 */

interface LoadedTheme {
  id: string;
  /** Absolute path of the theme JSON — iconPaths resolve against its directory. */
  jsonPath: string;
  data: IconThemeJson;
}

/** Keyed by theme id so switching themes reloads instead of serving the previous one. */
const themeCache = new Map<string, LoadedTheme | null>();

function activeThemeId(): string | undefined {
  try {
    return vscode.workspace.getConfiguration("workbench").get<string>("iconTheme")?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function loadActiveTheme(): LoadedTheme | null {
  const id = activeThemeId();
  if (!id) return null;
  const cached = themeCache.get(id);
  if (cached !== undefined) return cached;

  let loaded: LoadedTheme | null = null;
  try {
    for (const extension of vscode.extensions.all) {
      const manifest = extension.packageJSON as unknown as {
        contributes?: { iconThemes?: ReadonlyArray<{ id: string; path: string }> };
      };
      const contribution = manifest.contributes?.iconThemes?.find((theme) => theme.id === id);
      if (!contribution || !extension.extensionPath) continue;
      const jsonPath = path.resolve(extension.extensionPath, contribution.path);
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as IconThemeJson;
      if (data && typeof data === "object" && data.iconDefinitions) loaded = { id, jsonPath, data };
      break;
    }
  } catch {
    loaded = null;
  }
  themeCache.set(id, loaded);
  return loaded;
}

function bundledIconsRoot(): string | null {
  // The extension-host bundle lives at <extension>/dist/extension/extension.cjs; assets ship at
  // <extension>/assets/icons. Resolve from __dirname first — it works without any API — then fall
  // back to our own extension entry (the manifest id, not the historical ones this file replaced).
  const candidates = [
    path.resolve(__dirname, "..", "..", "assets", "icons"),
    path.resolve(__dirname, "..", "..", "..", "assets", "icons"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch { /* keep looking */ }
  }
  const own = vscode.extensions.getExtension("yesho.pi-coding-agent-vscode");
  if (own) {
    const dir = path.join(own.extensionPath, "assets", "icons");
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch { /* not packaged yet */ }
  }
  return null;
}

function isLightTheme(): boolean {
  return (
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light
    || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
  );
}

/** Absolute path of the first candidate that exists on disk, or null. */
function fileIconSourceFile(fileName: string, isDirectory: boolean): string | null {
  const theme = loadActiveTheme();
  const bundledRoot = bundledIconsRoot();
  const sources = iconSources({
    fileName,
    isDirectory,
    light: isLightTheme(),
    theme: theme?.data ?? null,
    bundled: BUNDLED_ICONS,
  });
  for (const source of sources) {
    let absolute: string;
    if (source.root === "theme") {
      if (!theme) continue;
      absolute = path.resolve(path.dirname(theme.jsonPath), source.rel);
    } else {
      if (!bundledRoot) continue;
      absolute = path.join(bundledRoot, source.rel);
    }
    try {
      if (fs.statSync(absolute).isFile()) return absolute;
    } catch { /* missing artwork: try the next candidate */ }
  }
  return null;
}

/**
 * Copy another extension's artwork into a path we own, for QuickPick's file-URI icons. The
 * destination is keyed by the source path so two themes with the same filename cannot collide.
 */
function publishExternal(src: string): string | null {
  try {
    const publishRoot = path.join(os.tmpdir(), "pi-file-icons");
    fs.mkdirSync(publishRoot, { recursive: true });
    const ext = path.extname(src);
    const key = `${createHash("sha1").update(src).digest("hex").slice(0, 10)}${ext}`;
    const dest = path.join(publishRoot, key);
    if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < fs.statSync(src).mtimeMs) {
      fs.copyFileSync(src, dest);
    }
    return dest;
  } catch {
    try {
      return fs.statSync(src).isFile() ? src : null;
    } catch {
      return null;
    }
  }
}

/** data:image/…;base64 for webview chips; keyed by theme + colour scheme so a switch refreshes. */
const dataUriCache = new Map<string, string>();

export function fileIconDataUri(fileName: string, isDirectory: boolean): string | undefined {
  const light = isLightTheme();
  const key = `${activeThemeId() ?? "none"}|${light ? "L" : "D"}|${isDirectory ? "d" : "f"}:${fileName.toLowerCase()}`;
  const cached = dataUriCache.get(key);
  if (cached !== undefined) return cached;

  const file = fileIconSourceFile(fileName, isDirectory);
  if (!file) return undefined;
  try {
    const mime = iconMimeType(file);
    if (!mime) return undefined;
    const uri = `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
    if (dataUriCache.size > 400) dataUriCache.clear();
    dataUriCache.set(key, uri);
    return uri;
  } catch {
    return undefined;
  }
}

/** QuickPick icon — theme/bundled artwork when available, else the built-in ThemeIcon. */
export function fileIconQuickPickIcon(
  fileName: string,
  isDirectory: boolean,
): vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } {
  const file = fileIconSourceFile(fileName, isDirectory);
  if (file) {
    const root = bundledIconsRoot();
    const stable = root && file.startsWith(root) ? file : publishExternal(file);
    if (stable) {
      const uri = vscode.Uri.file(stable);
      return { light: uri, dark: uri };
    }
  }
  return new vscode.ThemeIcon(isDirectory ? "folder" : "file");
}
