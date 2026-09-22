/**
 * Reads Pi's MCP configuration layers and derives what the chat panel shows.
 *
 * All of this is file state: the user layer (`~/.pi/agent/mcp.json`), the project override Pi
 * writes when a server is toggled (`<cwd>/.pi/mcp.json`, `disabled` only) and the adapter's
 * catalog cache (`~/.pi/agent/mcp-cache.json`).
 *
 * There is deliberately no connection status here. Pi only exposes that inside its own TUI
 * (`/mcp status`); outside it the best available signal is whether the catalog cache exists and
 * is fresh, which is what `McpCatalogState` reports instead of pretending to be live.
 *
 * No `vscode` import: the derivation is pure so it can be tested directly.
 */

import type { McpServerView } from "../../shared/model/mcpModel.js";

export const CATALOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type { McpServerView } from "../../shared/model/mcpModel.js";
export type McpCatalogState = McpServerView["catalog"];

export interface DeriveMcpServersInput {
  userConfig?: unknown;
  projectConfig?: unknown;
  cache?: unknown;
  now?: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Accepts both spellings the adapter understands. */
function serversOf(config: unknown): Record<string, unknown> | undefined {
  const root = record(config);
  if (!root) return undefined;
  return record(root.mcpServers) ?? record(root["mcp-servers"]);
}

/** Matches the adapter's rule: `disabled: true` or the legacy `enabled: false`. */
export function isMcpServerDisabled(entry: unknown): boolean {
  const value = record(entry);
  if (!value) return false;
  return value.disabled === true || value.enabled === false;
}

export function describeMcpServerCommand(entry: unknown): { command?: string; url?: string; transport?: string } {
  const value = record(entry);
  if (!value) return {};
  const transport = typeof value.transport === "string" && value.transport.trim() ? value.transport.trim() : undefined;
  const url = typeof value.url === "string" && value.url.trim() ? value.url.trim() : undefined;
  // Pi's config is `command` (a string) plus `args`, but a single argv array is also accepted.
  const asArgv = (candidate: unknown): string[] =>
    Array.isArray(candidate) ? candidate.filter((part): part is string => typeof part === "string" && part.length > 0) : [];
  const base = typeof value.command === "string" && value.command ? [value.command] : asArgv(value.command);
  const parts = [...base, ...asArgv(value.args)];
  const command = parts.length > 0 ? parts.join(" ") : undefined;
  return {
    ...(command ? { command } : {}),
    ...(url ? { url } : {}),
    ...(transport ? { transport } : {}),
  };
}

function catalogFor(name: string, cache: unknown, now: number): McpCatalogState {
  const servers = record(record(cache)?.servers);
  const entry = record(servers?.[name]);
  const tools = Array.isArray(entry?.tools) ? entry.tools : undefined;
  const cachedAt = typeof entry?.cachedAt === "number" ? entry.cachedAt : undefined;
  if (!tools || cachedAt === undefined) return { kind: "uncached" };
  const toolNames = tools
    .map((tool) => record(tool)?.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  const resourceCount = Array.isArray(entry?.resources) ? entry.resources.length : 0;
  const snapshot = { toolNames, resourceCount, cachedAt };
  if (now - cachedAt > CATALOG_MAX_AGE_MS) return { kind: "expired", ...snapshot };
  return { kind: "available", ...snapshot };
}

/**
 * Project entries override the user layer: Pi's own writer records only `disabled` there, so a
 * server defined at user level can still be switched off for one workspace without copying its
 * definition or credentials.
 */
export function deriveMcpServers(input: DeriveMcpServersInput): McpServerView[] {
  const now = input.now ?? Date.now();
  const userServers = serversOf(input.userConfig) ?? {};
  const projectServers = serversOf(input.projectConfig) ?? {};
  const names = [...new Set([...Object.keys(userServers), ...Object.keys(projectServers)])].sort();

  return names.map((name) => {
    const userEntry = record(userServers[name]);
    const projectEntry = record(projectServers[name]);
    const definedAtProject = userEntry === undefined;
    const scope: McpServerView["scope"] = definedAtProject ? "project" : "user";

    const definition = userEntry ?? projectEntry ?? {};
    // Pi's project layer only ever carries `disabled`, and its merge leaves the lower layer's flag
    // alone when an entry is present but silent — so an entry that merely exists (empty, or
    // holding only `command`) must not be read as "the project re-enabled this". Only an explicit
    // `disabled` / `enabled` key overrides; `disabled: false` is exactly what Pi writes when the
    // lower layer is itself disabled and the project layer turns it back on.
    const carriesFlag = projectEntry !== undefined && ("disabled" in projectEntry || "enabled" in projectEntry);
    const projectSaysDisabled = carriesFlag ? isMcpServerDisabled(projectEntry) : undefined;
    const enabled = projectSaysDisabled === undefined ? !isMcpServerDisabled(definition) : !projectSaysDisabled;

    return {
      name,
      scope,
      enabled,
      disabledByProject: projectSaysDisabled === true,
      ...describeMcpServerCommand(definition),
      catalog: catalogFor(name, input.cache, now),
    };
  });
}

export function countCatalogTools(servers: readonly McpServerView[]): number {
  return servers.reduce(
    (total, server) => total + (server.catalog.kind === "uncached" ? 0 : server.catalog.toolNames.length),
    0,
  );
}
