import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

import type { ConversationItemView } from "../../shared/model/conversationModel.js";
import { resolveReferencePath, startsAtHome } from "../_shared/paths/expandHome.js";
import { toolFilePath } from "./messageAssembler.js";

/**
 * Where the agent has been working, read back from its own tool calls.
 *
 * A reference such as `tests/elastic/test_ep.py:65` is written relative to the repository the agent
 * was looking at, which is not always the session's working directory: the agent may have run
 * `cd ../DeepEP && sed -n 1,120p tests/elastic/test_ep.py` from a session that lives in another
 * project. The session's directory cannot resolve that reference, but the tool calls name the
 * directory that can. Everything here only proposes candidates; the caller checks which exist.
 */

const MAX_PATHS = 200;
const MAX_PATHS_PER_COMMAND = 40;
const MAX_COMMAND_CHARS = 8_000;
const MAX_ANCESTOR_DEPTH = 6;
const MAX_CANDIDATES = 160;

/**
 * Absolute paths named by the session's tool calls, newest first: the `path` argument of file
 * tools, and for `bash` every directory it changes into plus every path-like word it passes,
 * placed in the directory it ran in. Paths are not checked for existence.
 */
export function sessionToolPaths(items: readonly ConversationItemView[], cwd: string): string[] {
  const paths = new Set<string>();
  for (let index = items.length - 1; index >= 0 && paths.size < MAX_PATHS; index--) {
    const item = items[index];
    if (item?.type !== "turn") continue;
    for (let position = item.items.length - 1; position >= 0; position--) {
      const entry = item.items[position];
      if (entry?.type !== "tool" || entry.tool.state !== "bound") continue;
      for (const path of toolPaths(entry.tool.name, entry.tool.args, cwd).reverse()) paths.add(path);
    }
  }
  return [...paths].slice(0, MAX_PATHS);
}

function toolPaths(name: string, args: Record<string, unknown>, cwd: string): string[] {
  const paths: string[] = [];
  const filePath = toolFilePath(args);
  if (filePath) paths.push(resolve(resolveReferencePath(filePath, cwd)));
  if (name === "bash" && typeof args.command === "string") paths.push(...commandPaths(args.command, cwd));
  return paths;
}

/**
 * Directories and path-like words of a shell command, in the order they appear, each placed in
 * the directory the command had reached by then (`cd a && cd b && cat c` names `a`, `a/b` and
 * `a/b/c`). Anything that needs the shell to expand it (`$VAR`, globs, `$(…)`) is skipped: a
 * wrong guess costs a failed lookup, never a wrong file, because candidates are checked later.
 */
export function commandPaths(command: string, cwd: string): string[] {
  const found: string[] = [];
  let directory = cwd;
  for (const words of statements(command.slice(0, MAX_COMMAND_CHARS))) {
    const [program, ...args] = words;
    if (program === "cd" || program === "pushd") {
      const target = args.find((word) => !word.startsWith("-"));
      const next = target === undefined ? undefined : placed(target, directory);
      if (next) {
        found.push(next);
        directory = next;
      }
      continue;
    }
    let base = directory;
    for (const [index, word] of args.entries()) {
      const isGitDirectory = program === "git" && args[index - 1] === "-C";
      if (!isGitDirectory && !looksLikePath(word)) continue;
      const path = placed(word, base);
      if (!path) continue;
      found.push(path);
      if (isGitDirectory) base = path;
    }
  }
  return found.slice(0, MAX_PATHS_PER_COMMAND);
}

/**
 * Absolute paths a relative `reference` may mean, best first, given paths the session named.
 *
 * 1. A named path that ends with the reference (`/r/DeepEP/tests/elastic/test_ep.py` for
 *    `tests/elastic/test_ep.py` or just `test_ep.py`), matched on whole path segments.
 * 2. The reference taken relative to a named directory or to one of its ancestors, so a file the
 *    agent never opened is still found once any other file of the same repository was.
 *
 * The home directory and the filesystem root are never used as roots, and absolute, `~` and `..`
 * references get no candidates: those say where they point and are not guessed at.
 */
export function referenceCandidates(
  reference: string,
  known: readonly string[],
  home: string = homedir(),
): string[] {
  const relative = relativeReference(reference);
  if (!relative) return [];

  const suffix = `/${relative}`;
  const seen = new Set<string>();
  const exact: string[] = [];
  const rooted: string[] = [];
  const add = (list: string[], path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    list.push(path);
  };

  for (const path of known) {
    if (path.replaceAll("\\", "/").endsWith(suffix)) add(exact, path);
  }
  for (const path of known) {
    let directory = path;
    for (let depth = 0; depth <= MAX_ANCESTOR_DEPTH; depth++) {
      const parent = dirname(directory);
      if (directory === home || parent === directory) break;
      add(rooted, resolve(directory, relative));
      directory = parent;
    }
  }
  return [...exact, ...rooted].slice(0, MAX_CANDIDATES);
}

/** True for a reference that is relative to some directory, the only kind this module can place. */
export function isRelativeReference(reference: string): boolean {
  return relativeReference(reference) !== undefined;
}

function relativeReference(reference: string): string | undefined {
  if (isAbsolute(reference) || startsAtHome(reference)) return undefined;
  const parts = reference.replaceAll("\\", "/").split("/").filter((part) => part !== "" && part !== ".");
  if (parts.length === 0 || parts.includes("..")) return undefined;
  return parts.join("/");
}

const NEEDS_SHELL = /[$`*?[\]{}!#]/;

function placed(word: string, directory: string): string | undefined {
  if (NEEDS_SHELL.test(word.replace(/^(?:\$HOME|\$\{HOME\})/, ""))) return undefined;
  return resolve(resolveReferencePath(word, directory));
}

function looksLikePath(word: string): boolean {
  if (word.length > 512 || word.startsWith("-") || word.includes("=") || word.includes("://")) return false;
  return word.includes("/") || /\.[A-Za-z0-9]{1,8}$/.test(word);
}

/** Splits a command into statements of words, honouring quotes; `&&`, `||`, `;`, pipes and newlines end one. */
function statements(source: string): string[][] {
  const result: string[][] = [];
  let words: string[] = [];
  let word = "";
  let inWord = false;
  const endWord = (): void => {
    if (!inWord) return;
    words.push(word);
    word = "";
    inWord = false;
  };
  const endStatement = (): void => {
    endWord();
    if (words.length > 0) result.push(words);
    words = [];
  };

  for (let index = 0; index < source.length; index++) {
    const char = source.charAt(index);
    if (char === "'" || char === '"') {
      const end = source.indexOf(char, index + 1);
      const stop = end < 0 ? source.length : end;
      word += source.slice(index + 1, stop);
      inWord = true;
      index = stop;
    } else if (char === "\\") {
      word += source.charAt(index + 1);
      inWord = true;
      index += 1;
    } else if (char === " " || char === "\t" || char === "\r") {
      endWord();
    } else if (";&|()\n".includes(char)) {
      endStatement();
    } else {
      word += char;
      inWord = true;
    }
  }
  endStatement();
  return result;
}
