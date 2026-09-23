import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { readMcpServers } from "../../src/extension/mcp/readMcpServers.js";
import { applyMcpServerEnabled } from "../../src/extension/mcp/writeMcpServerEnabled.js";

/**
 * The switch is global: it writes the layer the server is defined in (the user config) and clears
 * this session's local override, because a workspace-scoped override alone is what made a disable
 * invisible to every other folder.
 */

const FEISHU_USER = `{
    "mcpServers": {
        "feishu-mcp-pro": {
            "command": "/opt/homebrew/bin/npx",
            "args": ["-y", "@mi/feishu-mcp-pro@latest"],
            "transport": "stdio"
        },
        "other-server": {
            "command": "other"
        }
    }
}
`;

async function seed(agentDir: string, workDir: string, files: { user?: string; project?: string }): Promise<void> {
  if (files.user !== undefined) {
    await mkdir(dirname(join(agentDir, "mcp.json")), { recursive: true });
    await writeFile(join(agentDir, "mcp.json"), files.user, "utf8");
  }
  if (files.project !== undefined) {
    await mkdir(join(workDir, ".pi"), { recursive: true });
    await writeFile(join(workDir, ".pi", "mcp.json"), files.project, "utf8");
  }
}

function paths(agentDir: string, workDir: string): { user: string; project: string } {
  return { user: join(agentDir, "mcp.json"), project: join(workDir, ".pi", "mcp.json") };
}

describe("applyMcpServerEnabled — global switch", () => {
  it("disables in the user layer, keeping the file's own indentation", async () => {
    const root = await mkdtemp(join(tmpdir(), "frostui-mcp-global-"));
    const agentDir = join(root, "agent");
    const workDir = join(root, "work");
    await seed(agentDir, workDir, { user: FEISHU_USER });

    await applyMcpServerEnabled(workDir, "feishu-mcp-pro", false, { PI_CODING_AGENT_DIR: agentDir });

    const raw = await readFile(join(agentDir, "mcp.json"), "utf8");
    const parsed = JSON.parse(raw) as { mcpServers: Record<string, { disabled?: boolean; command?: string }> };
    expect(parsed.mcpServers["feishu-mcp-pro"]!.disabled).toBe(true);
    expect(parsed.mcpServers["other-server"]!.command).toBe("other");
    // Four-space indent and trailing newline survive the rewrite.
    expect(raw.startsWith('{\n    "mcpServers"')).toBe(true);
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("enables globally and clears only this workspace's override", async () => {
    const root = await mkdtemp(join(tmpdir(), "frostui-mcp-enable-"));
    const agentDir = join(root, "agent");
    const workDir = join(root, "work");
    const { user, project } = paths(agentDir, workDir);
    await seed(agentDir, workDir, {
      user: JSON.stringify({
        mcpServers: {
          "feishu-mcp-pro": { command: "npx", disabled: true },
          "other-server": { command: "other" },
        },
      }),
      project: JSON.stringify({
        mcpServers: {
          "feishu-mcp-pro": { disabled: true },
          "another-workspace-override": { disabled: true },
        },
      }),
    });

    await applyMcpServerEnabled(workDir, "feishu-mcp-pro", true, { PI_CODING_AGENT_DIR: agentDir });

    const afterUser = JSON.parse(await readFile(user, "utf8")) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(afterUser.mcpServers["feishu-mcp-pro"]).toEqual({ command: "npx" });
    expect("disabled" in afterUser.mcpServers["feishu-mcp-pro"]!).toBe(false);

    const afterProject = JSON.parse(await readFile(project, "utf8")) as { mcpServers: Record<string, Record<string, unknown>> };
    // This workspace's override is gone…
    expect(Object.hasOwn(afterProject.mcpServers, "feishu-mcp-pro")).toBe(false);
    // …but overrides that belong to other servers are not ours to touch.
    expect(afterProject.mcpServers["another-workspace-override"]).toEqual({ disabled: true });
  });

  it("switches a workspace-only server in the project layer, where its definition lives", async () => {
    const root = await mkdtemp(join(tmpdir(), "frostui-mcp-local-"));
    const agentDir = join(root, "agent");
    const workDir = join(root, "work");
    const { user, project } = paths(agentDir, workDir);
    await seed(agentDir, workDir, {
      project: JSON.stringify({ mcpServers: { local: { command: "local-cmd" } } }),
    });

    await applyMcpServerEnabled(workDir, "local", false, { PI_CODING_AGENT_DIR: agentDir });
    let parsed = JSON.parse(await readFile(project, "utf8")) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(parsed.mcpServers.local).toMatchObject({ command: "local-cmd", disabled: true });
    // The user layer was never created: this server is not defined there.
    await expect(readFile(user, "utf8")).rejects.toThrow();

    await applyMcpServerEnabled(workDir, "local", true, { PI_CODING_AGENT_DIR: agentDir });
    parsed = JSON.parse(await readFile(project, "utf8")) as { mcpServers: Record<string, Record<string, unknown>> };
    expect(parsed.mcpServers.local).toEqual({ command: "local-cmd" });
  });

  it("prunes an override entry that is left with nothing, like Pi itself does", async () => {
    const root = await mkdtemp(join(tmpdir(), "frostui-mcp-prune-"));
    const agentDir = join(root, "agent");
    const workDir = join(root, "work");
    await seed(agentDir, workDir, {
      user: FEISHU_USER,
      project: JSON.stringify({ mcpServers: { "feishu-mcp-pro": { disabled: true } } }),
    });

    await applyMcpServerEnabled(workDir, "feishu-mcp-pro", true, { PI_CODING_AGENT_DIR: agentDir });

    const after = JSON.parse(await readFile(join(workDir, ".pi", "mcp.json"), "utf8")) as { mcpServers: unknown };
    expect(after.mcpServers).toEqual({});
  });

  it("refuses to guess when the server is in no config", async () => {
    const root = await mkdtemp(join(tmpdir(), "frostui-mcp-missing-"));
    const agentDir = join(root, "agent");
    const workDir = join(root, "work");
    await seed(agentDir, workDir, { user: JSON.stringify({ mcpServers: {} }) });

    await expect(applyMcpServerEnabled(workDir, "nope", false, { PI_CODING_AGENT_DIR: agentDir })).rejects.toThrow(/not defined in/);
  });

  it("surfaces a broken user config instead of overwriting it", async () => {
    const root = await mkdtemp(join(tmpdir(), "frostui-mcp-broken-"));
    const agentDir = join(root, "agent");
    const workDir = join(root, "work");
    await seed(agentDir, workDir, { user: "{ not json" });

    await expect(applyMcpServerEnabled(workDir, "feishu-mcp-pro", false, { PI_CODING_AGENT_DIR: agentDir })).rejects.toThrow(/not valid JSON/);
  });

  it("shows up as a global disable when read back through the panel's reader", async () => {
    const root = await mkdtemp(join(tmpdir(), "frostui-mcp-readback-"));
    const agentDir = join(root, "agent");
    const workDir = join(root, "work");
    await seed(agentDir, workDir, {
      user: FEISHU_USER,
      project: JSON.stringify({ mcpServers: { "feishu-mcp-pro": { disabled: true } } }),
    });
    const env = { PI_CODING_AGENT_DIR: agentDir };

    await applyMcpServerEnabled(workDir, "feishu-mcp-pro", false, { PI_CODING_AGENT_DIR: agentDir });

    const result = await readMcpServers(workDir, env);
    expect(result.servers.find((server) => server.name === "feishu-mcp-pro")).toMatchObject({
      enabled: false,
      disabledByProject: false, // the local override was cleared, so the *global* flag is what shows
      scope: "user",
    });
  });
});
