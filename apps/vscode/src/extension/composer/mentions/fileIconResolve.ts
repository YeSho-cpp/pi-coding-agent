/**
 * Which icon file a chip should use — deliberately free of `vscode` so the policy (the active
 * file icon theme first, the bundled subset second) can be tested on its own.
 */

export interface IconThemeDefinition {
  /** Relative path to the artwork. Absent on font-based themes (e.g. VS Code's default Seti). */
  iconPath?: string;
  fontCharacter?: string;
  fontId?: string;
}

export interface IconThemeOverlay {
  file?: string;
  folder?: string;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  folderNames?: Record<string, string>;
}

/** The parts of a file-icon-theme JSON this extension understands. */
export interface IconThemeJson {
  iconDefinitions?: Record<string, IconThemeDefinition>;
  file?: string;
  folder?: string;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  folderNames?: Record<string, string>;
  light?: IconThemeOverlay;
}

export interface IconSource {
  /** `theme` resolves against the theme JSON's directory, `bundled` against our assets. */
  root: "theme" | "bundled";
  rel: string;
}

/** Theme id lookup: names beat extensions beat the generic file, honouring the light overlay. */
export function pickIconId(
  theme: IconThemeJson,
  fileName: string,
  isDirectory: boolean,
  light: boolean,
): string | null {
  const overlay = light ? theme.light : undefined;
  const name = fileName.replace(/\/+$/, "");
  const lower = name.toLowerCase();

  if (isDirectory) {
    return (
      overlay?.folderNames?.[lower]
      ?? theme.folderNames?.[lower]
      ?? overlay?.folder
      ?? theme.folder
      ?? "folder"
    );
  }

  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? lower.slice(dot + 1) : "";
  return (
    overlay?.fileNames?.[lower]
    ?? theme.fileNames?.[lower]
    ?? (ext ? overlay?.fileExtensions?.[ext] : undefined)
    ?? (ext ? theme.fileExtensions?.[ext] : undefined)
    ?? overlay?.file
    ?? theme.file
    ?? "file"
  );
}

/**
 * Candidates in resolution order. A theme definition only counts when it points at a real file:
 * font-based themes carry `fontCharacter` instead, which cannot be shown as an `<img>`, so those
 * fall through to the bundled subset — the "no usable icon theme" case.
 */
export function iconSources(input: {
  fileName: string;
  isDirectory: boolean;
  light: boolean;
  theme?: IconThemeJson | null;
  bundled: IconThemeJson;
}): IconSource[] {
  const sources: IconSource[] = [];
  const consider = (theme: IconThemeJson | null | undefined, root: IconSource["root"]): void => {
    if (!theme) return;
    const id = pickIconId(theme, input.fileName, input.isDirectory, input.light);
    const def = id ? theme.iconDefinitions?.[id] : undefined;
    if (def?.iconPath) sources.push({ root, rel: def.iconPath });
  };
  consider(input.theme, "theme");
  consider(input.bundled, "bundled");
  return sources;
}

/** MIME for a data: URI; null when the artwork is in a format we cannot embed. */
export function iconMimeType(relPath: string): string | null {
  const ext = relPath.slice(relPath.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "svg": return "image/svg+xml";
    case "png": return "image/png";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "jpg":
    case "jpeg": return "image/jpeg";
    default: return null;
  }
}
