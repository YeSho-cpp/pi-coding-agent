import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { mcpConfigPaths, piAgentDirectory, readMcpServers } from "../../src/extension/mcp/readMcpServers.js";

/**
 * The panel reads three files owned by other processes and must still answer. What matters here
 * is the contract: a missing file is normal, an unreadable one is reported, and the paths follow
 * Pi's own agent-directory override.
 */

async function workspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "frostui-mcp-read-"));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf8");
}

describe("mcpConfigPaths", () => {
  it("follows PI_CODING_AGENT_DIR so the panel reads what Pi reads", () => {
    const env = { PI_CODING_AGENT_DIR: "/custom/agent" };
    expect(piAgentDirectory(env)).toBe("/custom/agent");
    const paths = mcpConfigPaths("/work/project", env);
    expect(paths.user).toBe("/custom/agent/mcp.json");
    expect(paths.cache).toBe("/custom/agent/mcp-cache.json");
    expect(paths.project).toBe(resolve("/work/project", ".pi", "mcp.json"));
  });

  it("falls back to ~/.pi/agent and rejects a blank override", () => {
    expect(piAgentDirectory({ PI_CODING_AGENT_DIR: "   " })).toMatch(/\.pi[\\/]agent$/);
    expect(piAgentDirectory({})).toMatch(/\.pi[\\/]agent$/);
  });

  it("keeps the project override inside the session's working directory", () => {
    const paths = mcpConfigPaths("/work/project", { PI_CODING_AGENT_DIR: "/custom/agent" });
    expect(paths.project.startsWith("/work/project")).toBe(true);
  });
});

describe("readMcpServers", () => {
  it("treats missing files as an empty answer, not a warning", async () => {
    const cwd = await workspace();
    const env = { PI_CODING_AGENT_DIR: join(cwd, "agent") };

    const result = await readMcpServers(cwd, env);

    expect(result.servers).toEqual([]);
    expect(result.warning).toBeUndefined();
    expect(result.paths.project).toBe(join(cwd, ".pi", "mcp.json"));
  });

  it("derives the view from all three files when they are present", async () => {
    const cwd = await workspace();
    const env = { PI_CODING_AGENT_DIR: join(cwd, "agent") };
    await writeJson(join(cwd, "agent", "mcp.json"), { mcpServers: { feishu: { command: "npx", args: ["x"] } } });
    await writeJson(join(cwd, ".pi", "mcp.json"), { mcpServers: { feishu: { disabled: true } } });
    await writeJson(join(cwd, "agent", "mcp-cache.json"), {
      version: 1,
      servers: { feishu: { tools: [{ name: "doc_read" }], resources: [], cachedAt: 1_800_000_000_000 } },
    });

    const result = await readMcpServers(cwd, env, 1_800_000_000_000);

    expect(result.warning).toBeUndefined();
    expect(result.servers).toHaveLength(1);
    expect(result.servers[0]).toMatchObject({
      name: "feishu",
      enabled: false,
      disabledByProject: true,
      catalog: { kind: "available", toolNames: ["doc_read"] },
    });
  });

  it("reports a malformed file by path instead of showing an empty panel", async () => {
    const cwd = await workspace();
    const env = { PI_CODING_AGENT_DIR: join(cwd, "agent") };
    await mkdir(join(cwd, "agent"), { recursive: true });
    await writeFile(join(cwd, "agent", "mcp.json"), "{ not json", "utf8");
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(join(cwd, ".pi", "mcp.json"), "{ also broken", "utf8");

    const result = await readMcpServers(cwd, env);

    expect(result.warning).toContain("mcp.json is not valid JSON");
    expect(result.warning?.split(" · ")).toHaveLength(2);
    expect(result.servers).toEqual([]);
  });

  it("names every broken file in one warning rather than stopping at the first", async () => {
    const cwd = await workspace();
    const env = { PI_CODING_AGENT_DIR: join(cwd, "agent") };
    await mkdir(join(cwd, "agent"), { recursive: true });
    await writeFile(join(cwd, "agent", "mcp.json"), "[]", "utf8"); // valid JSON, wrong shape
    await writeFile(join(cwd, "agent", "mcp-cache.json"), "nope", "utf8");
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(join(cwd, ".pi", "mcp.json"), "{ \"mcpServers\": ", "utf8");

    const result = await readMcpServers(cwd, env);

    // `[]` parses, so only the two that fail to parse produce warnings — and both are named.
    expect(result.warning?.split(" · ")).toHaveLength(2);
    expect(result.warning).toContain(join(cwd, "agent", "mcp-cache.json"));
    expect(result.warning).toContain(join(cwd, ".pi", "mcp.json"));
    expect(result.servers).toEqual([]);
  });

  it("surfaces a path that exists but cannot be read instead of showing an empty panel", async () => {
    const cwd = await workspace();
    const env = { PI_CODING_AGENT_DIR: join(cwd, "agent") };
    // A directory where a file is expected: the read fails with something other than ENOENT, and
    // that must not be mistaken for "this workspace has no MCP servers".
    await mkdir(join(cwd, "agent"), { recursive: true });
    await mkdir(join(cwd, "agent", "mcp.json"), { recursive: true });

    const result = await readMcpServers(cwd, env);

    expect(result.warning).toContain(join(cwd, "agent", "mcp.json"));
    expect(result.warning).toContain("could not be read");
    expect(result.servers).toEqual([]);
  });
});
