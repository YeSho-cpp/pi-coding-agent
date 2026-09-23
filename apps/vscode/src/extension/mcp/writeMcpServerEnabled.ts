import { readFile, writeFile } from "node:fs/promises";

import { mcpConfigPaths } from "./readMcpServers.js";

/**
 * The panel's switch is global: it edits the layer the server is *defined* in (the user config),
 * because that is the only place a disable reaches every session — Pi's own `/mcp disable` writes
 * a workspace override in `<cwd>/.pi/mcp.json`, which is invisible to every other folder.
 *
 * Toggling also clears this session's local override, so a workspace that had one follows the new
 * global state immediately instead of shadowing it. The running Pi process reloads on its next
 * start; nothing here talks to it.
 */

interface RawJsonFile {
  raw: string;
  indent: string;
  finalNewline: boolean;
  value: Record<string, unknown>;
}

type ServersEntry = { servers: Record<string, unknown>; key: string };

async function readJsonFile(path: string): Promise<RawJsonFile | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return undefined;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const value = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
  const indentMatch = raw.match(/^([ \t]+)"/m);
  return { raw, indent: indentMatch?.[1] ?? "  ", finalNewline: raw.endsWith("\n"), value };
}

function serialize(file: RawJsonFile): string {
  return JSON.stringify(file.value, null, file.indent) + (file.finalNewline ? "\n" : "");
}

async function writeIfChanged(path: string, file: RawJsonFile, changed: boolean): Promise<void> {
  if (!changed) return;
  await writeFile(path, serialize(file), "utf8");
}

/** The servers map that actually holds this server; Pi accepts either spelling. */
function serversHolding(file: RawJsonFile, server: string): ServersEntry | undefined {
  for (const key of ["mcpServers", "mcp-servers"]) {
    const container = file.value[key];
    if (typeof container === "object" && container !== null && !Array.isArray(container)
      && Object.hasOwn(container, server)) {
      return { servers: container as Record<string, unknown>, key };
    }
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function setDisabledFlag(entry: Record<string, unknown>, enabled: boolean): boolean {
  if (enabled) {
    const hadDisabled = "disabled" in entry;
    const hadEnabled = "enabled" in entry;
    delete entry.disabled;
    delete entry.enabled;
    return hadDisabled || hadEnabled;
  }
  const already = entry.disabled === true && !("enabled" in entry);
  entry.disabled = true;
  delete entry.enabled;
  return !already;
}

/** Remove a local override for `server`; prune an entry left with no keys (what Pi itself writes). */
function stripOverride(file: RawJsonFile, server: string): boolean {
  const found = serversHolding(file, server);
  if (!found) return false;
  const entry = asObject(found.servers[server]);
  if (!entry) return false;
  const hadFlag = "disabled" in entry || "enabled" in entry;
  delete entry.disabled;
  delete entry.enabled;
  const emptied = Object.keys(entry).length === 0;
  if (emptied) delete found.servers[server];
  return hadFlag || emptied;
}

/**
 * `env` is required rather than defaulting to `process.env`: `PI_CODING_AGENT_DIR` decides which
 * user config is written, and a caller that forgets it writes the real one — including from tests.
 */
export async function applyMcpServerEnabled(
  cwd: string,
  server: string,
  enabled: boolean,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const paths = mcpConfigPaths(cwd, env);
  const userFile = await readJsonFile(paths.user);
  const userEntry = userFile ? serversHolding(userFile, server) : undefined;

  if (userFile && userEntry) {
    const entry = asObject(userEntry.servers[server]);
    if (!entry) throw new Error(`${paths.user}: server "${server}" is not a config object.`);
    const changed = setDisabledFlag(entry, enabled);
    await writeIfChanged(paths.user, userFile, changed);
    // The global layer is now the source of truth; a local override would shadow it here.
    const projectFile = await readJsonFile(paths.project);
    if (projectFile) await writeIfChanged(paths.project, projectFile, stripOverride(projectFile, server));
    return;
  }

  // Workspace-only server: its definition lives in the project layer, so that *is* its global.
  const projectFile = await readJsonFile(paths.project);
  const projectEntry = projectFile ? serversHolding(projectFile, server) : undefined;
  if (!projectFile || !projectEntry) {
    throw new Error(`Server "${server}" is not defined in ${paths.user} or ${paths.project}.`);
  }
  const entry = asObject(projectEntry.servers[server]);
  if (!entry) throw new Error(`${paths.project}: server "${server}" is not a config object.`);
  const changed = enabled
    ? stripOverride(projectFile, server)
    : setDisabledFlag(entry, false);
  await writeIfChanged(paths.project, projectFile, changed);
}
