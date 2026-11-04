import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/**
 * Expands a leading `~` the way Pi does for every path it reads or writes (`utils/paths.js`):
 * `~` and `~/…` become the home directory, and `~\…` does too where `\` separates paths. `~name/…`
 * is somebody else's home, which Pi leaves alone, so it stays a plain relative name here too.
 *
 * Anything else is returned unchanged. The home directory is the one of the machine this code runs
 * on, which under Remote SSH is the same machine Pi runs on.
 */
export function expandHome(
  path: string,
  options: { homeDirectory?: string; separators?: "native" | "both" } = {},
): string {
  const home = options.homeDirectory ?? homedir();
  const backslash = options.separators === "both" || process.platform === "win32";
  if (path === "~") return home;
  if (path.startsWith("~/") || (backslash && path.startsWith("~\\"))) return join(home, path.slice(2));
  return path;
}

/** `$HOME`, `${HOME}` and their `/`-separated tails: how a shell command spells the same place. */
const HOME_VARIABLE = /^(?:\$HOME|\$\{HOME\})(?=[\\/]|$)/;

/**
 * The absolute path a reference to a file means, as written by the agent or by a person.
 *
 * - `~`, `~/x`: relative to the home directory, as in Pi.
 * - `$HOME/x`, `${HOME}/x`: the same place spelled as a shell would. Models write these in prose
 *   about commands, and they read as file references too.
 * - an absolute path stays as it is.
 * - anything else is relative to `base` (the session's working directory).
 *
 * Expanding is all it does: it never checks the file exists and never searches for a different one.
 */
export function resolveReferencePath(
  path: string,
  base: string,
  options: { homeDirectory?: string } = {},
): string {
  const home = options.homeDirectory ?? homedir();
  const withoutVariable = HOME_VARIABLE.test(path) ? `~${path.replace(HOME_VARIABLE, "")}` : path;
  const expanded = expandHome(withoutVariable, { homeDirectory: home });
  return isAbsolute(expanded) ? expanded : resolve(base, expanded);
}

/** True when the path names the home directory or something under it with `~` or `$HOME`. */
export function startsAtHome(path: string): boolean {
  return HOME_VARIABLE.test(path) || expandHome(path, { homeDirectory: "\0" }) !== path;
}
