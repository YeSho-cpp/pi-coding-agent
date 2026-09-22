import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { deriveMcpServers, type McpServerView } from "./mcpServers.js";

/**
 * Pi's agent directory. Pi itself honours PI_CODING_AGENT_DIR (its own ENV_AGENT_DIR), so the
 * panel must too or it would read a different config than the running agent.
 */
export function piAgentDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
}

export interface McpConfigPaths {
  /** User layer: server definitions live here. */
  user: string;
  /** Project layer: Pi writes `disabled` overrides here, nothing else. */
  project: string;
  /** The adapter's tool catalog cache. */
  cache: string;
}

export function mcpConfigPaths(cwd: string, env: NodeJS.ProcessEnv = process.env): McpConfigPaths {
  const agent = piAgentDirectory(env);
  return {
    user: join(agent, "mcp.json"),
    project: resolve(cwd, ".pi", "mcp.json"),
    cache: join(agent, "mcp-cache.json"),
  };
}

interface ReadOutcome {
  value?: unknown;
  /** Only set when the file exists but is not usable — a missing file is normal. */
  error?: string;
}

async function readJson(path: string): Promise<ReadOutcome> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    // Absent is normal. Anything else — unreadable, a directory, a broken parent — must surface,
    // or a permission problem would read as "this workspace has no MCP servers".
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    return { error: `${path} could not be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error: `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export interface McpServersReadResult {
  servers: McpServerView[];
  paths: McpConfigPaths;
  /** Surfaced in the panel instead of silently showing an empty list. */
  warning?: string;
}

/** Reads the three files and derives the panel's view. Never throws: the panel always gets a reply. */
export async function readMcpServers(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): Promise<McpServersReadResult> {
  const paths = mcpConfigPaths(cwd, env);
  const [user, project, cache] = await Promise.all([
    readJson(paths.user),
    readJson(paths.project),
    readJson(paths.cache),
  ]);
  const problems = [user.error, project.error, cache.error].filter((value): value is string => Boolean(value));
  return {
    servers: deriveMcpServers({ userConfig: user.value, projectConfig: project.value, cache: cache.value, now }),
    paths,
    ...(problems.length > 0 ? { warning: problems.join(" · ") } : {}),
  };
}
