// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import type { McpServerView } from "../../src/shared/model/mcpModel.js";
import type { SessionViewModel } from "../../src/shared/model/sessionViewModel.js";
import { BRIDGE_VERSION } from "../../src/shared/bridge/bridgeVersion.js";
import { get } from "svelte/store";

/**
 * The MCP panel is reachable only through header state, so it is driven here the way a reader
 * drives it: open the menu, expand a server, type into the tool search, flip a switch.
 *
 * `acquireVsCodeApi` is stubbed before the component is imported, because the bridge captures it
 * once at module load and that is the only way to see what the panel sends to the host.
 */

const posted: unknown[] = [];

// Must happen before the component loads: the bridge reads this once, at module scope.
(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  postMessage: (message: unknown) => posted.push(message),
  getState: () => undefined,
  setState: () => undefined,
});

const { default: SessionHeader } = await import("../../src/webview/features/sessions/SessionHeader.svelte");
const { mcpServers, presentationStore, EMPTY_PRESENTATION } = await import("../../src/webview/state/sessionViewStore.svelte.js");
const { applyHostMessage } = await import("../../src/webview/bridge/applyHostMessage.js");

function activeSession(): SessionViewModel {
  return {
    id: "s1",
    title: "Session",
    status: "ready",
    cwd: "/tmp",
    workingDirectoryLabel: "tmp",
    historyStatus: "loaded",
    isEphemeral: false,
    isCompacting: false,
    isForking: false,
    isNavigatingTree: false,
    isSummarizingTree: false,
    sessionTreeAvailable: false,
    pendingExtensionUi: [],
    questionTool: { appliedEnabled: false, configuredEnabled: false, restartRequired: false },
  } as unknown as SessionViewModel;
}

function cataloged(name: string, toolNames: string[]): McpServerView {
  return {
    name,
    scope: "user",
    enabled: true,
    disabledByProject: false,
    transport: "stdio",
    command: "npx -y feishu-mcp-pro",
    catalog: { kind: "available", toolNames, resourceCount: 1, cachedAt: Date.now() },
  };
}

function openPanel(servers: McpServerView[] | null): HTMLElement {
  mcpServers.set(servers ? { sessionId: "s1", servers } : null);
  return render(SessionHeader, { props: { sessions: [], active: activeSession() } }).container;
}

async function openMcpPanel(): Promise<void> {
  await fireEvent.click(screen.getByLabelText("MCP servers"));
}

/** Opening the panel also reads the config, so the toggle is isolated by type. */
function togglesSent(): unknown[] {
  return posted.filter((message) => (message as { type?: string }).type === "setMcpServerEnabled");
}

afterEach(() => {
  cleanup();
  mcpServers.set(null);
  posted.length = 0;
});

describe("session header MCP panel", () => {
  it("stays closed until the reader opens it", async () => {
    const container = openPanel([cataloged("feishu-mcp-pro", ["wiki_get"])]);

    expect(screen.queryByText("MCP servers")).toBeNull();

    await openMcpPanel();

    expect(screen.getByText("MCP servers")).toBeTruthy();
    expect(container.querySelector(".mcp-panel")).toBeTruthy();
  });

  it("reports that a read is pending before the host answers", async () => {
    openPanel(null);

    await openMcpPanel();

    expect(screen.getByText("Reading…")).toBeTruthy();
  });

  it("lists servers with their catalog size and scope", async () => {
    openPanel([cataloged("feishu-mcp-pro", ["wiki_get", "wiki_search"])]);

    await openMcpPanel();

    expect(screen.getByText("feishu-mcp-pro")).toBeTruthy();
    expect(screen.getByText("user")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("hides tool names until a server is expanded", async () => {
    openPanel([cataloged("feishu-mcp-pro", ["wiki_get"])]);

    await openMcpPanel();

    expect(screen.queryByText("wiki_get")).toBeNull();
  });

  it("filters the expanded tool list by the search text", async () => {
    openPanel([cataloged("feishu-mcp-pro", ["wiki_get", "doc_search"])]);

    await openMcpPanel();
    await fireEvent.click(screen.getByText("feishu-mcp-pro"));
    await fireEvent.input(screen.getByPlaceholderText("Search 2 tools…"), { target: { value: "doc" } });

    expect(screen.getByText("doc_search")).toBeTruthy();
    expect(screen.queryByText("wiki_get")).toBeNull();
  });

  it("says so when no tool matches", async () => {
    openPanel([cataloged("feishu-mcp-pro", ["wiki_get"])]);

    await openMcpPanel();
    await fireEvent.click(screen.getByText("feishu-mcp-pro"));
    await fireEvent.input(screen.getByPlaceholderText("Search 1 tools…"), { target: { value: "zzz" } });

    expect(screen.getByText("No tool matches.")).toBeTruthy();
  });

  it("keeps one search box per server instead of sharing it", async () => {
    openPanel([
      cataloged("feishu-mcp-pro", ["wiki_get", "doc_search"]),
      cataloged("other", ["wiki_other"]),
    ]);

    await openMcpPanel();
    await fireEvent.click(screen.getByText("feishu-mcp-pro"));
    await fireEvent.click(screen.getByText("other"));
    await fireEvent.input(screen.getByPlaceholderText("Search 2 tools…"), { target: { value: "doc" } });

    expect(screen.getByText("doc_search")).toBeTruthy();
    expect(screen.queryByText("wiki_get")).toBeNull();
    expect(screen.getByText("wiki_other")).toBeTruthy();
  });

  it("explains a server that has no catalog yet", async () => {
    openPanel([{ ...cataloged("idle", []), catalog: { kind: "uncached" } }]);

    await openMcpPanel();
    await fireEvent.click(screen.getByText("idle"));

    expect(screen.getByText("No catalog yet — Pi caches it the first time the server runs.")).toBeTruthy();
  });

  it("marks a server switched off for this workspace", async () => {
    const container = openPanel([
      { ...cataloged("feishu-mcp-pro", ["wiki_get"]), enabled: false, disabledByProject: true },
    ]);

    await openMcpPanel();

    expect(container.querySelector(".mcp-server.mcp-off")).toBeTruthy();
  });

  it("closes the action menu when the MCP panel opens, so only one popover shows", async () => {
    const container = openPanel([cataloged("feishu-mcp-pro", ["wiki_get"])]);

    await fireEvent.click(screen.getByLabelText("Session actions"));
    await openMcpPanel();

    expect(container.querySelectorAll(".session-menu")).toHaveLength(1);
  });

  it("asks the host to disable a server, scoped to this workspace", async () => {
    openPanel([cataloged("feishu-mcp-pro", ["wiki_get"])]);

    await openMcpPanel();
    await fireEvent.click(screen.getByLabelText("Disable feishu-mcp-pro for this workspace"));

    expect(togglesSent()).toEqual([expect.objectContaining({
      type: "setMcpServerEnabled",
      sessionId: "s1",
      server: "feishu-mcp-pro",
      enabled: false,
    })]);
  });

  it("asks the host to enable a server that is off", async () => {
    openPanel([{ ...cataloged("feishu-mcp-pro", ["wiki_get"]), enabled: false, disabledByProject: true }]);

    await openMcpPanel();
    await fireEvent.click(screen.getByLabelText("Enable feishu-mcp-pro for this workspace"));

    expect(togglesSent()).toEqual([expect.objectContaining({ enabled: true })]);
  });

  it("shows the switch as off for a disabled server", async () => {
    openPanel([{ ...cataloged("feishu-mcp-pro", ["wiki_get"]), enabled: false, disabledByProject: true }]);

    await openMcpPanel();

    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("explains why a switch would be refused, but leaves it clickable", async () => {
    mcpServers.set({ sessionId: "s1", servers: [cataloged("feishu-mcp-pro", ["wiki_get"])] });
    render(SessionHeader, {
      props: { sessions: [], active: { ...activeSession(), status: "running" } },
    });

    await openMcpPanel();

    const toggle = screen.getByRole<HTMLButtonElement>("switch");
    expect(toggle.getAttribute("title")).toBe("Wait for the Pi session to be ready");

    // The host owns the rule: a silent disabled control would give no reason at all.
    await fireEvent.click(toggle);
    expect(togglesSent()).toHaveLength(1);
  });

  it("drops a reply for a session the reader has already left", () => {
    presentationStore.set({ ...EMPTY_PRESENTATION, displayedSession: activeSession() });
    mcpServers.set(null);
    const reply = { type: "mcpServers" as const, sessionId: "s1", servers: [cataloged("feishu-mcp-pro", ["wiki_get"])] };

    applyHostMessage({ bridgeVersion: BRIDGE_VERSION, ...reply, sessionId: "another-session" });
    expect(get(mcpServers)).toBeNull();

    applyHostMessage({ bridgeVersion: BRIDGE_VERSION, ...reply });
    expect(get(mcpServers)?.servers.map((server) => server.name)).toEqual(["feishu-mcp-pro"]);
  });
});
