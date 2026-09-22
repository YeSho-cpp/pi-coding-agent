import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATALOG_MAX_AGE_MS,
  countCatalogTools,
  deriveMcpServers,
  describeMcpServerCommand,
  isMcpServerDisabled,
} from "../../src/extension/mcp/mcpServers.js";

const FEISHU = {
  command: "/opt/homebrew/bin/npx",
  args: ["-y", "--registry=https://example.invalid/npm/", "@mi/feishu-mcp-pro@latest"],
  transport: "stdio",
  env: { PATH: "/opt/homebrew/bin:/usr/bin" },
};

const NOW = 1_800_000_000_000;
const day = 24 * 60 * 60 * 1000;

const cacheFor = (name: string, overrides: Record<string, unknown> = {}) => ({
  version: 1,
  servers: {
    [name]: { tools: [{ name: "doc_read" }, { name: "drive_list" }], resources: [{}], cachedAt: NOW - day, ...overrides },
  },
});

describe("isMcpServerDisabled", () => {
  it("honours both spellings the adapter understands", () => {
    expect(isMcpServerDisabled({ disabled: true })).toBe(true);
    expect(isMcpServerDisabled({ enabled: false })).toBe(true);
    expect(isMcpServerDisabled({ disabled: false, enabled: true })).toBe(false);
    expect(isMcpServerDisabled(undefined)).toBe(false);
  });
});

describe("describeMcpServerCommand", () => {
  it("joins an argv command and keeps a remote endpoint separate", () => {
    expect(describeMcpServerCommand(FEISHU)).toEqual({
      command: "/opt/homebrew/bin/npx -y --registry=https://example.invalid/npm/ @mi/feishu-mcp-pro@latest",
      transport: "stdio",
    });
    expect(describeMcpServerCommand({ url: "https://example.invalid/mcp", transport: "http" })).toEqual({
      url: "https://example.invalid/mcp",
      transport: "http",
    });
  });

  it("drops empty argv entries instead of joining holes", () => {
    expect(describeMcpServerCommand({ command: ["npx", "", "-y"] }).command).toBe("npx -y");
    expect(describeMcpServerCommand({ command: [] }).command).toBeUndefined();
  });
});

describe("deriveMcpServers", () => {
  it("reports a user-level server with its catalog state", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { "feishu-mcp-pro": FEISHU } },
      cache: cacheFor("feishu-mcp-pro"),
      now: NOW,
    });
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      name: "feishu-mcp-pro",
      scope: "user",
      enabled: true,
      disabledByProject: false,
      transport: "stdio",
      catalog: { kind: "available", toolNames: ["doc_read", "drive_list"], resourceCount: 1 },
    });
  });

  it("lets the project override switch a user-level server off without redefining it", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { "feishu-mcp-pro": FEISHU } },
      projectConfig: { mcpServers: { "feishu-mcp-pro": { disabled: true } } },
      now: NOW,
    });
    expect(servers[0]).toMatchObject({ scope: "user", enabled: false, disabledByProject: true });
    // The definition itself is untouched: that is what Pi's writer guarantees.
    expect(servers[0]?.command).toContain("@mi/feishu-mcp-pro@latest");
  });

  it("treats an explicit disabled:false override as re-enabling a disabled definition", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { "feishu-mcp-pro": { ...FEISHU, disabled: true } } },
      projectConfig: { mcpServers: { "feishu-mcp-pro": { disabled: false } } },
      now: NOW,
    });
    expect(servers[0]).toMatchObject({ enabled: true, disabledByProject: false });
  });

  it("reads a server that exists only in the project layer", () => {
    const servers = deriveMcpServers({
      projectConfig: { mcpServers: { local: { command: ["npx", "thing"] } } },
      now: NOW,
    });
    expect(servers[0]).toMatchObject({ name: "local", scope: "project", enabled: true, catalog: { kind: "uncached" } });
  });

  it("accepts the kebab-case key the adapter also reads", () => {
    const servers = deriveMcpServers({ userConfig: { "mcp-servers": { a: { command: "x" } } }, now: NOW });
    expect(servers.map((server) => server.name)).toEqual(["a"]);
  });

  it("sorts names and ignores malformed config", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { zebra: { command: "z" }, alpha: { command: "a" } } },
      now: NOW,
    });
    expect(servers.map((server) => server.name)).toEqual(["alpha", "zebra"]);
    expect(deriveMcpServers({ userConfig: "not an object", now: NOW })).toEqual([]);
    expect(deriveMcpServers({ userConfig: { mcpServers: [] }, now: NOW })).toEqual([]);
  });
});

describe("catalog state", () => {
  it("separates a fresh cache from an expired one and from none at all", () => {
    const fresh = deriveMcpServers({ userConfig: { mcpServers: { s: {} } }, cache: cacheFor("s"), now: NOW });
    expect(fresh[0]?.catalog.kind).toBe("available");

    const old = deriveMcpServers({
      userConfig: { mcpServers: { s: {} } },
      cache: cacheFor("s", { cachedAt: NOW - 8 * day }),
      now: NOW,
    });
    expect(old[0]?.catalog.kind).toBe("expired");

    const none = deriveMcpServers({ userConfig: { mcpServers: { s: {} } }, cache: cacheFor("s"), now: NOW });
    expect(none[0]?.catalog.kind).toBe("available");
    const missing = deriveMcpServers({ userConfig: { mcpServers: { other: {} } }, cache: cacheFor("s"), now: NOW });
    expect(missing[0]?.catalog).toEqual({ kind: "uncached" });
  });
});

describe("project override shapes Pi actually writes", () => {
  it("reads back enabled after the adapter's enable prunes the server to an empty entry", async () => {
    // What `/mcp enable` leaves behind: the `disabled` key is dropped, and an entry left with no
    // keys at all is pruned to an empty server map.
    const written = join(await mkdtemp(join(tmpdir(), "frostui-mcp-enable-")), ".pi", "mcp.json");
    await mkdir(join(written, ".."), { recursive: true });
    await writeFile(written, '{ "mcpServers": {} }', "utf8");
    expect(JSON.parse(await readFile(written, "utf8"))).toEqual({ mcpServers: {} });

    const servers = deriveMcpServers({
      userConfig: { mcpServers: { "feishu-mcp-pro": FEISHU } },
      projectConfig: { mcpServers: {} },
      now: NOW,
    });
    expect(servers[0]).toMatchObject({ scope: "user", enabled: true, disabledByProject: false });
    expect(servers[0]?.command).toContain("@mi/feishu-mcp-pro@latest");
  });

  it("keeps an explicit disabled:false entry re-enabled when the lower layer is disabled", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { s: { command: "x", disabled: true } } },
      projectConfig: { mcpServers: { s: { disabled: false } } },
      now: NOW,
    });
    expect(servers[0]).toMatchObject({ enabled: true, disabledByProject: false });
  });

  it("takes the definition from the user layer when both layers define the server", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { s: { command: "from-user" } } },
      projectConfig: { mcpServers: { s: { command: "from-project" }, only: { command: "p" } } },
      now: NOW,
    });
    expect(servers.map((server) => [server.name, server.scope, server.command])).toEqual([
      ["only", "project", "p"],
      ["s", "user", "from-user"],
    ]);
  });

  it("reports a definition disabled at the user layer as off without blaming the workspace", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { s: { command: "x", disabled: true } } },
      now: NOW,
    });
    expect(servers[0]).toMatchObject({ enabled: false, disabledByProject: false });
  });

  it("does not let a silent project entry re-enable a definition the lower layer disabled", () => {
    // An entry that carries no `disabled`/`enabled` key says nothing; Pi's own merge keeps the
    // lower layer's flag, so the panel must too.
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { s: { command: "x", disabled: true } } },
      projectConfig: { mcpServers: { s: {} } },
      now: NOW,
    });
    expect(servers[0]).toMatchObject({ enabled: false, disabledByProject: false });
  });
});

describe("catalog cache edge cases", () => {
  it("accepts an empty tool list as cached rather than as no catalog", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { s: {} } },
      cache: cacheFor("s", { tools: [] }),
      now: NOW,
    });
    expect(servers[0]?.catalog).toMatchObject({ kind: "available", toolNames: [] });
  });

  it("treats a cache entry without a timestamp as uncached", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { s: {} } },
      cache: cacheFor("s", { cachedAt: undefined }),
      now: NOW,
    });
    expect(servers[0]?.catalog).toEqual({ kind: "uncached" });
  });

  it("stays available exactly at the seven-day mark and expires a millisecond after", () => {
    const base = { userConfig: { mcpServers: { s: {} } }, cache: cacheFor("s", { cachedAt: NOW - CATALOG_MAX_AGE_MS }) };
    expect(deriveMcpServers({ ...base, now: NOW })[0]?.catalog.kind).toBe("available");
    expect(deriveMcpServers({ ...base, now: NOW + 1 })[0]?.catalog.kind).toBe("expired");
  });

  it("ignores tool entries that are not named strings", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { s: {} } },
      cache: cacheFor("s", { tools: [{ name: "good" }, { name: "" }, { name: 42 }, {}, "string"] }),
      now: NOW,
    });
    expect(servers[0]?.catalog).toMatchObject({ kind: "available", toolNames: ["good"] });
  });

  it("falls back to uncached when the cache is the wrong shape", () => {
    for (const cache of ["nope", { servers: [] }, { servers: { s: { tools: "not-an-array" } } }, null]) {
      const servers = deriveMcpServers({ userConfig: { mcpServers: { s: {} } }, cache, now: NOW });
      expect(servers[0]?.catalog).toEqual({ kind: "uncached" });
    }
  });
});

describe("countCatalogTools", () => {
  it("counts only servers whose catalog is present", () => {
    const servers = deriveMcpServers({
      userConfig: { mcpServers: { a: {}, b: {} } },
      cache: cacheFor("a"),
      now: NOW,
    });
    // `a` has a cached catalog, `b` does not.
    const refreshed = servers.map((server) => (server.name === "a" ? { ...server, catalog: { kind: "available" as const, toolNames: new Array<string>(50).fill("t"), resourceCount: 1, cachedAt: NOW } } : server));
    expect(countCatalogTools(refreshed)).toBe(50);
  });
});
