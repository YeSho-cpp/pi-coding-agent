export interface FileReference {
  path: string;
  line?: number;
  column?: number;
  endLine?: number;
  /** The path ends with a separator: the reference names a directory. */
  isDirectory?: boolean;
}

export interface ParseFileReferenceOptions {
  /**
   * When true (default), only recognize paths whose final segment has a known
   * text-file extension or matches a common filename such as `Makefile` or
   * `LICENSE`. This avoids turning arbitrary dotted tokens like `v1.2.3` into
   * file links. Markdown links are parsed with this disabled because an explicit
   * `[text](href)` already signals user intent.
   */
  requireKnownExtension?: boolean;
}

const GITHUB_LOCATION_SUFFIX = /#L(\d+)(?:-L(\d+))?$/i;
const LINE_RANGE_SUFFIX = /:(\d+)-(\d+)$/;
const LOCATION_SUFFIX = /:(\d+)(?::(\d+))?$/;
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/i;
const ABSOLUTE_PATH = /^(?:[\\/]|[a-z]:[\\/])/i;
const EXPLICIT_RELATIVE_PATH = /^\.{1,2}[\\/]/;
const FILE_NAME = /(?:^|[\\/])(?:\.[^\s./\\]+|[^\s/\\]+\.[a-z][a-z\d._-]*)$/i;

/**
 * Known text-file extensions: source, build, config, schema, and data formats. Binaries,
 * archives, and media stay out. So does any extension that doubles as an everyday
 * identifier (`process.env`, `np.sum`, `np.diff`, `this.props`, `mock.patch`, `self.cmd`,
 * `pyspark.ml`): inline code like that must not turn into a file chip.
 */
const ALLOWED_FILE_EXTENSIONS = new Set([
  "adoc",
  "asciidoc",
  "asm",
  "astro",
  "avsc",
  "awk",
  "bash",
  "bat",
  "bazel",
  "bib",
  "bicep",
  "bst",
  "bzl",
  "c",
  "cfg",
  "cc",
  "cjs",
  "clj",
  "cljc",
  "cljs",
  "cls",
  "cmake",
  "cnf",
  "coffee",
  "conf",
  "config",
  "cpp",
  "cs",
  "csh",
  "cshtml",
  "csproj",
  "css",
  "csv",
  "cts",
  "cu",
  "cuh",
  "cxx",
  "dart",
  "dockerfile",
  "dtd",
  "dtx",
  "edn",
  "ejs",
  "elm",
  "erb",
  "erl",
  "ex",
  "exs",
  "fd",
  "fish",
  "fs",
  "fsi",
  "fsproj",
  "fsx",
  "gemspec",
  "geojson",
  "glsl",
  "go",
  "gotmpl",
  "gql",
  "gradle",
  "graphql",
  "groovy",
  "h",
  "hbs",
  "hcl",
  "hh",
  "hip",
  "hlsl",
  "hpp",
  "hrl",
  "hs",
  "htm",
  "html",
  "hxx",
  "ini",
  "inl",
  "ins",
  "ipp",
  "ipynb",
  "ixx",
  "j2",
  "java",
  "jinja",
  "jinja2",
  "jl",
  "js",
  "json",
  "json5",
  "jsonc",
  "jsonl",
  "jsonnet",
  "jsx",
  "ksh",
  "kt",
  "kts",
  "less",
  "lhs",
  "libsonnet",
  "liquid",
  "lisp",
  "lock",
  "log",
  "ltx",
  "lua",
  "md",
  "mdx",
  "mjs",
  "mk",
  "mli",
  "mts",
  "mustache",
  "ndjson",
  "nim",
  "ninja",
  "nix",
  "njk",
  "pcss",
  "php",
  "pl",
  "plist",
  "pm",
  "podspec",
  "prisma",
  "properties",
  "proto",
  "ps1",
  "psd1",
  "psm1",
  "ptx",
  "pug",
  "pxd",
  "py",
  "pyi",
  "pyw",
  "pyx",
  "qmd",
  "rake",
  "razor",
  "rb",
  "rkt",
  "rmd",
  "rs",
  "rst",
  "sass",
  "sbatch",
  "sbt",
  "scala",
  "scm",
  "scss",
  "sed",
  "service",
  "sh",
  "sln",
  "slurm",
  "sol",
  "sql",
  "sty",
  "styl",
  "sv",
  "svelte",
  "svg",
  "svh",
  "swift",
  "tcl",
  "tex",
  "tf",
  "tfvars",
  "thrift",
  "tmpl",
  "toml",
  "tpl",
  "tpp",
  "ts",
  "tsx",
  "twig",
  "txt",
  "vb",
  "vbproj",
  "vhdl",
  "vim",
  "vue",
  "wgsl",
  "xaml",
  "xml",
  "xsd",
  "xsl",
  "xslt",
  "yaml",
  "yml",
  "zig",
  "zsh",
]);

/**
 * Common filenames without an extension, plus dotfiles whose suffix is not in
 * the extension whitelist (e.g. `.env.local`). Case-insensitive.
 */
const ALLOWED_FILE_BASENAMES = new Set([
  "authors",
  "brewfile",
  "caddyfile",
  "changelog",
  "code_of_conduct",
  "codeowners",
  "containerfile",
  "contributing",
  "copying",
  "cname",
  "dockerfile",
  "earthfile",
  "gemfile",
  "gemfile.lock",
  "gnumakefile",
  "go.mod",
  "go.sum",
  "go.work",
  "jenkinsfile",
  "justfile",
  "license",
  "makefile",
  "pipfile",
  "podfile",
  "procfile",
  "rakefile",
  "readme",
  "security",
  "snakefile",
  "tiltfile",
  "vagrantfile",
  ".babelrc",
  ".bashrc",
  ".browserslistrc",
  ".clang-format",
  ".clang-tidy",
  ".dockerignore",
  ".editorconfig",
  ".env",
  ".env.development",
  ".env.example",
  ".env.local",
  ".env.production",
  ".env.staging",
  ".env.test",
  ".envrc",
  ".eslintignore",
  ".eslintrc",
  ".gitattributes",
  ".gitignore",
  ".gitkeep",
  ".gitmodules",
  ".graphqlconfig",
  ".htaccess",
  ".inputrc",
  ".latexmkrc",
  ".mocharc",
  ".node-version",
  ".npmrc",
  ".nvmrc",
  ".nycrc",
  ".python-version",
  ".prettierrc",
  ".sequelizerc",
  ".tool-versions",
  ".vimrc",
  ".yarnrc",
  ".zshrc",
]);

export function fileBasename(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  const lastBackslash = path.lastIndexOf("\\");
  return path.slice(Math.max(lastSlash, lastBackslash) + 1);
}

function isRecognizableFilePath(path: string): boolean {
  return FILE_NAME.test(path) || ALLOWED_FILE_BASENAMES.has(fileBasename(path).toLowerCase());
}

/** `Dockerfile.prod` / `Containerfile.dev`: the build-file name is the prefix, the variant the extension. */
const BUILD_FILE_VARIANT = /^(?:docker|container)file\./i;

function hasAllowedFileSuffix(path: string): boolean {
  const basename = fileBasename(path);
  const lowerBasename = basename.toLowerCase();
  if (ALLOWED_FILE_BASENAMES.has(lowerBasename) || BUILD_FILE_VARIANT.test(basename)) return true;

  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0) return false;

  const extension = basename.slice(dotIndex + 1).toLowerCase();
  return ALLOWED_FILE_EXTENSIONS.has(extension);
}

export function parseFileReference(
  value: string,
  options: ParseFileReferenceOptions = {},
): FileReference | null {
  let path = value.trim();
  if (!path || /[\0\r\n]/.test(path)) return null;

  let line: number | undefined;
  let column: number | undefined;
  let endLine: number | undefined;
  const githubLocation = GITHUB_LOCATION_SUFFIX.exec(path);
  const lineRange = LINE_RANGE_SUFFIX.exec(path);
  const location = LOCATION_SUFFIX.exec(path);
  const suffix = githubLocation ?? lineRange ?? location;
  if (suffix) {
    line = Number(suffix[1]);
    if (suffix === location) column = suffix[2] === undefined ? undefined : Number(suffix[2]);
    else endLine = suffix[2] === undefined ? undefined : Number(suffix[2]);

    if (!Number.isSafeInteger(line) || line < 1) return null;
    if (column !== undefined && (!Number.isSafeInteger(column) || column < 1)) return null;
    if (endLine !== undefined && (!Number.isSafeInteger(endLine) || endLine < line)) return null;
    path = path.slice(0, suffix.index);
  }

  if (!path || /\s/.test(path)) return null;
  if (URI_SCHEME.test(path) && !WINDOWS_ABSOLUTE_PATH.test(path)) return null;
  if (!ABSOLUTE_PATH.test(path) && !EXPLICIT_RELATIVE_PATH.test(path) && !isRecognizableFilePath(path)) return null;
  // Trailing separators and extensionless absolute paths name folders (or extension-less
  // files like a build directory) that agents reference constantly; the extension
  // whitelist only has to keep guarding dotted relative tokens (`v1.2.3`, `photo.jpg`).
  const isDirectory = /[\\/]$/.test(path);
  const extensionlessAbsolute = !isDirectory && isExtensionlessAbsolutePath(path);
  if (options.requireKnownExtension !== false && !hasAllowedFileSuffix(path) && !isDirectory && !extensionlessAbsolute) return null;

  return {
    path,
    ...(isDirectory ? { isDirectory: true } : {}),
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
    ...(endLine === undefined ? {} : { endLine }),
  };
}

/** `/a/b/pat-trace` — absolute, final segment present, no dot anywhere in that segment. */
function isExtensionlessAbsolutePath(path: string): boolean {
  if (!ABSOLUTE_PATH.test(path)) return false;
  const name = fileBasename(path.replace(/[\\/]+$/, ""));
  return name.length > 0 && !name.includes(".");
}

export function parseFileHref(href: string): FileReference | null {
  try {
    return parseFileReference(decodeURIComponent(href), { requireKnownExtension: false });
  } catch {
    return parseFileReference(href, { requireKnownExtension: false });
  }
}
