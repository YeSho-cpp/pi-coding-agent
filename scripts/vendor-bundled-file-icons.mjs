/**
 * Vendors a MIT-licensed icon subset from Material Icon Theme into the extension, so chips still
 * get a colour icon when the user's VS Code has no usable file icon theme active.
 *
 * Outputs (committed):
 *   apps/vscode/assets/icons/*.svg           — the SVGs themselves
 *   apps/vscode/assets/icons/NOTICE.md       — provenance + MIT notice
 *   apps/vscode/assets/icons/LICENSE.material-icon-theme.txt
 *   apps/vscode/src/extension/composer/mentions/bundledIcons.ts — theme-shaped map
 *
 * Usage: node scripts/vendor-bundled-file-icons.mjs [path-to-material-icon-theme]
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outIconsDir = join(root, "apps", "vscode", "assets", "icons");
const outTs = join(root, "apps", "vscode", "src", "extension", "composer", "mentions", "bundledIcons.ts");

/** Files the panel is most likely to attach; anything Material lacks is skipped. */
const EXTENSIONS = [
  "sh", "bash", "zsh", "fish", "py", "pyw", "js", "mjs", "cjs", "jsx", "ts", "mts", "tsx",
  "json", "md", "mdx", "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "log", "txt",
  "csv", "tsv", "xml", "svg", "html", "htm", "css", "scss", "sass", "less",
  "go", "rs", "java", "kt", "kts", "cs", "c", "h", "cpp", "hpp", "cc", "php", "rb",
  "swift", "scala", "vue", "svelte", "sql", "ps1", "bat", "r", "dart", "lua", "pl",
  "proto", "tf", "hcl", "gradle", "cmake", "ipynb", "lock", "patch", "diff",
  "tar", "gz", "zip", "7z", "rar", "pdf", "png", "jpg", "jpeg", "gif", "webp",
  "mp4", "mov", "mp3", "wav", "flac", "bin", "exe", "m", "mm", "ex", "exs", "clj", "groovy",
];
const FILE_NAMES = [
  "dockerfile", "makefile", "cmakelists.txt", ".gitignore", ".gitattributes", ".gitmodules",
  ".env", ".npmrc", ".yarnrc", ".editorconfig", ".bashrc", ".zshrc", ".bash_profile",
  "license", "license.txt", "readme", "readme.md", "changelog", "changelog.md",
];
/** Folder names worth colouring in a picker; the generic folder covers everything else. */
const FOLDER_NAMES = ["src", "lib", "bin", "test", "tests", "docs", "doc", "assets", "public", "config", "scripts"];

function findMaterialRoot(explicit) {
  if (explicit) {
    if (!existsSync(join(explicit, "dist", "material-icons.json"))) throw new Error(`No material-icons.json under ${explicit}`);
    return explicit;
  }
  const base = join(homedir(), ".vscode", "extensions");
  for (const entry of readdirSync(base)) {
    if (!/material-icon-theme/i.test(entry)) continue;
    const rootPath = join(base, entry);
    if (existsSync(join(rootPath, "dist", "material-icons.json"))) return rootPath;
  }
  throw new Error("Material Icon Theme not found; pass its path as argv[2]");
}

const materialRoot = findMaterialRoot(process.argv[2]);
const distDir = join(materialRoot, "dist");
const material = JSON.parse(readFileSync(join(distDir, "material-icons.json"), "utf8"));
const version = JSON.parse(readFileSync(join(materialRoot, "package.json"), "utf8")).version ?? "unknown";

const pick = (map, keys) => {
  const out = {};
  for (const key of keys) {
    const id = map?.[key?.toLowerCase?.() ? key.toLowerCase() : key];
    if (typeof id === "string" && id) out[key.toLowerCase()] = id;
  }
  return out;
};

const fileExtensions = pick(material.fileExtensions, EXTENSIONS);
const fileNames = pick(material.fileNames, FILE_NAMES);
const folderNames = pick(material.folderNames, FOLDER_NAMES);

const light = material.light ?? {};
const lightFileExtensions = pick(light.fileExtensions, Object.keys(fileExtensions));
const lightFileNames = pick(light.fileNames, Object.keys(fileNames));
const lightFolderNames = pick(light.folderNames, Object.keys(folderNames));

/** Every icon id the bundled map can resolve to, plus the generic file/folder. */
const selectedIds = new Set([
  material.file, material.folder, light.file, light.folder,
  ...Object.values(fileExtensions), ...Object.values(fileNames), ...Object.values(folderNames),
  ...Object.values(lightFileExtensions), ...Object.values(lightFileNames), ...Object.values(lightFolderNames),
].filter((id) => typeof id === "string" && id.length > 0));

mkdirSync(outIconsDir, { recursive: true });

const iconDefinitions = {};
const copied = new Set();
for (const id of [...selectedIds].sort()) {
  const def = material.iconDefinitions?.[id];
  if (!def?.iconPath) continue; // font glyph or missing — falls through at runtime
  const source = resolve(distDir, def.iconPath);
  if (!existsSync(source)) continue;
  const destName = source.split("/").pop(); // flat icons/ directory in Material
  copyFileSync(source, join(outIconsDir, destName));
  copied.add(destName);
  iconDefinitions[id] = { iconPath: destName };
}

const filterMap = (map) => Object.fromEntries(
  Object.entries(map).filter(([, id]) => Object.hasOwn(iconDefinitions, id)),
);

const bundled = {
  iconDefinitions,
  file: iconDefinitions[material.file] ? material.file : undefined,
  folder: iconDefinitions[material.folder] ? material.folder : undefined,
  fileExtensions: filterMap(fileExtensions),
  fileNames: filterMap(fileNames),
  folderNames: filterMap(folderNames),
  light: {
    ...(light.file && iconDefinitions[light.file] ? { file: light.file } : {}),
    ...(light.folder && iconDefinitions[light.folder] ? { folder: light.folder } : {}),
    ...(Object.keys(lightFileExtensions).length ? { fileExtensions: filterMap(lightFileExtensions) } : {}),
    ...(Object.keys(lightFileNames).length ? { fileNames: filterMap(lightFileNames) } : {}),
    ...(Object.keys(lightFolderNames).length ? { folderNames: filterMap(lightFolderNames) } : {}),
  },
};
if (bundled.file === undefined) delete bundled.file;
if (bundled.folder === undefined) delete bundled.folder;

const ts = `/**
 * Generated by scripts/vendor-bundled-file-icons.mjs — do not edit by hand.
 *
 * Fallback icon map for VS Code installations without a usable file icon theme. Icons are a
 * subset of Material Icon Theme (MIT), vendored under apps/vscode/assets/icons with the license
 * alongside; see NOTICE.md there. Shape matches an icon-theme JSON so the runtime can resolve
 * it with the same code path as any installed theme.
 */
import type { IconThemeJson } from "./fileIconResolve.js";

export const BUNDLED_ICONS: IconThemeJson = ${JSON.stringify(bundled, null, 2)};
`;
writeFileSync(outTs, ts);

const notice = `# Bundled file icons — provenance

The SVG files in this directory are a subset of
[Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)
(\`PKief.material-icon-theme\`), vendored so this extension can show a colour icon on context chips
even when the user's VS Code has no usable file icon theme active.

- Vendored from version: ${version}
- Upstream license: MIT — full text in \`LICENSE.material-icon-theme.txt\`
- Regenerate with: \`node scripts/vendor-bundled-file-icons.mjs\`

They are used only as a fallback: when a file icon theme *is* active, the chip follows that theme
instead.
`;
writeFileSync(join(outIconsDir, "NOTICE.md"), notice);
copyFileSync(join(materialRoot, "LICENSE.txt"), join(outIconsDir, "LICENSE.material-icon-theme.txt"));

console.log(`icons: ${copied.size} svg | extensions: ${Object.keys(bundled.fileExtensions ?? {}).length} | names: ${Object.keys(bundled.fileNames ?? {}).length} | folders: ${Object.keys(bundled.folderNames ?? {}).length}`);
console.log("written:", outIconsDir);
console.log("written:", outTs);
