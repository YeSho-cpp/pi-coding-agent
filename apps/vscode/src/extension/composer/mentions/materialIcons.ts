import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as vscode from "vscode";

/** Resolve file/folder icons from the installed Material Icon Theme (MIT). */
const MATERIAL_EXTENSION_IDS = [
  "PKief.material-icon-theme",
  "pkief.material-icon-theme",
];

const FROST_EXTENSION_IDS = ["yesho.pi-coding-agent", "yesho.frostui", "yesho.frostpi"];

interface IconDefinition {
  iconPath: string;
}

interface MaterialIconsJson {
  iconDefinitions: Record<string, IconDefinition>;
  file?: string;
  folder?: string;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  folderNames?: Record<string, string>;
  light?: {
    file?: string;
    folder?: string;
    fileExtensions?: Record<string, string>;
    fileNames?: Record<string, string>;
    folderNames?: Record<string, string>;
  };
}

interface MaterialThemeCache {
  iconRoot: string;
  data: MaterialIconsJson;
  /** Directory QuickPick can reliably read (copied icons). */
  publishRoot: string;
}

let cache: MaterialThemeCache | null | undefined;

function extensionsDirCandidates(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".vscode", "extensions"),
    path.join(home, ".vscode-insiders", "extensions"),
    path.join(home, ".cursor", "extensions"),
    path.join(home, "Library", "Application Support", "Code", "User", "extensions"),
  ];
}

function findMaterialThemeDir(): string | null {
  for (const id of MATERIAL_EXTENSION_IDS) {
    const ext = vscode.extensions.getExtension(id);
    if (ext?.extensionPath && fs.existsSync(path.join(ext.extensionPath, "dist", "material-icons.json"))) {
      return ext.extensionPath;
    }
  }
  for (const dir of extensionsDirCandidates()) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (!/material-icon-theme/i.test(entry)) continue;
        const root = path.join(dir, entry);
        if (fs.existsSync(path.join(root, "dist", "material-icons.json"))) return root;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function frostPublishRoot(): string {
  for (const id of FROST_EXTENSION_IDS) {
    const ext = vscode.extensions.getExtension(id);
    if (ext?.extensionPath) {
      return path.join(ext.extensionPath, "assets", "runtime-material-icons");
    }
  }
  return path.join(os.tmpdir(), "pi-material-icons");
}

function loadMaterialTheme(): MaterialThemeCache | null {
  if (cache !== undefined) return cache;
  cache = null;
  const themeRoot = findMaterialThemeDir();
  if (!themeRoot) return cache;
  try {
    const jsonPath = path.join(themeRoot, "dist", "material-icons.json");
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as MaterialIconsJson;
    if (!data?.iconDefinitions) return cache;
    const publishRoot = frostPublishRoot();
    fs.mkdirSync(publishRoot, { recursive: true });
    cache = {
      iconRoot: path.join(themeRoot, "dist"),
      data,
      publishRoot,
    };
  } catch {
    cache = null;
  }
  return cache;
}

function isLightTheme(): boolean {
  return (
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light
    || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
  );
}

function pickIconId(fileName: string, isDirectory: boolean): string | null {
  const theme = loadMaterialTheme();
  if (!theme) return null;
  const light = isLightTheme();
  const overlay = light ? theme.data.light : undefined;
  const name = fileName.replace(/\/+$/, "");
  const lower = name.toLowerCase();

  if (isDirectory) {
    return (
      overlay?.folderNames?.[lower]
      || theme.data.folderNames?.[lower]
      || overlay?.folder
      || theme.data.folder
      || "folder"
    );
  }

  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? lower.slice(dot + 1) : "";
  return (
    overlay?.fileNames?.[lower]
    || theme.data.fileNames?.[lower]
    || (ext ? overlay?.fileExtensions?.[ext] : undefined)
    || (ext ? theme.data.fileExtensions?.[ext] : undefined)
    || overlay?.file
    || theme.data.file
    || "file"
  );
}

/** Publish Material SVG into a path QuickPick will render (extension assets / tmp). */
function publishIconFile(iconId: string): string | null {
  const theme = loadMaterialTheme();
  if (!theme) return null;
  const def = theme.data.iconDefinitions[iconId];
  if (!def?.iconPath) return null;
  const src = path.resolve(theme.iconRoot, def.iconPath);
  if (!fs.existsSync(src)) return null;
  const safe = iconId.replace(/[^\w.-]+/g, "_");
  const dest = path.join(theme.publishRoot, `${safe}.svg`);
  try {
    if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < fs.statSync(src).mtimeMs) {
      fs.copyFileSync(src, dest);
    }
    return dest;
  } catch {
    try {
      return src;
    } catch {
      return null;
    }
  }
}

/** Absolute path of a Material icon SVG, or null when the theme is missing. */
export function materialIconFile(fileName: string, isDirectory: boolean): string | null {
  const theme = loadMaterialTheme();
  if (!theme) return null;
  const iconId = pickIconId(fileName, isDirectory);
  if (!iconId) return null;
  return publishIconFile(iconId);
}

/** data:image/svg+xml;base64 for webview chips (cached — selection paths hit this often). */
const dataUriCache = new Map<string, string>();

export function materialIconDataUri(fileName: string, isDirectory: boolean): string | undefined {
  const cacheKey = `${isDirectory ? "d" : "f"}:${fileName.toLowerCase()}`;
  const cached = dataUriCache.get(cacheKey);
  if (cached) return cached;
  const file = materialIconFile(fileName, isDirectory);
  if (!file) return undefined;
  try {
    const svg = fs.readFileSync(file);
    const uri = `data:image/svg+xml;base64,${svg.toString("base64")}`;
    if (dataUriCache.size > 200) dataUriCache.clear();
    dataUriCache.set(cacheKey, uri);
    return uri;
  } catch {
    return undefined;
  }
}

/** QuickPick icon — Material SVG when available, else ThemeIcon. */
export function materialQuickPickIcon(
  fileName: string,
  isDirectory: boolean,
): vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } {
  const file = materialIconFile(fileName, isDirectory);
  if (file) {
    const uri = vscode.Uri.file(file);
    return { light: uri, dark: uri };
  }
  return new vscode.ThemeIcon(isDirectory ? "folder" : "file");
}

export function hasMaterialIconTheme(): boolean {
  return loadMaterialTheme() !== null;
}
