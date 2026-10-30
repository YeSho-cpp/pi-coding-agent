import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  window: { showWarningMessage: vi.fn() },
  workspace: {
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  },
}));

const { WebviewConnection } = await import("../../src/extension/webview-host/WebviewConnection.js");
const { applyHostMessage } = await import("../../src/webview/bridge/applyHostMessage.js");
const { presentationStore } = await import("../../src/webview/state/sessionViewStore.svelte.js");
const { BRIDGE_VERSION } = await import("../../src/shared/bridge/bridgeVersion.js");

import type { AgentTurnItemView, AgentTurnView, ConversationItemView, ConversationMessageView } from "../../src/shared/model/conversationModel.js";

/**
 * A long agentic turn streamed through the real host connection and applied by the real
 * Webview reducer. The Webview must end every step holding exactly what the host holds, and
 * the wire must not carry the turn's heavy, unchanged parts again.
 */

const SCREENSHOT = "data:image/png;base64," + "A".repeat(600_000);
const TOOL_OUTPUT = "output line\n".repeat(4_000);

/** The projection builds a turn's user message once and carries the same object through every update. */
const userMessages = new Map<string, ConversationMessageView>();

function userTurn(items: AgentTurnItemView[], status: AgentTurnView["status"], turnId: string): AgentTurnView {
  let userMessage = userMessages.get(turnId);
  if (!userMessage) {
    userMessage = {
      id: `${turnId}-user`,
      role: "user",
      status: "complete",
      timestamp: 1,
      blocks: [
        { type: "text", text: "Look at this screenshot and fix it" },
        { type: "images", images: [{ id: `${turnId}-img`, name: "shot.png", mimeType: "image/png", dataUrl: SCREENSHOT, size: SCREENSHOT.length }] },
      ],
    };
    userMessages.set(turnId, userMessage);
  }
  return { id: turnId, type: "turn", status, startedAt: 1, userMessage, items };
}

function tool(id: string): AgentTurnItemView {
  return {
    id,
    type: "tool",
    timestamp: 1,
    tool: { state: "bound", id: `call-${id}`, name: "bash", label: "ls", args: {}, status: "complete", isError: false, startedAt: 1, output: TOOL_OUTPUT },
  };
}

function response(text: string): AgentTurnItemView {
  return { id: "answer", type: "response", status: "streaming", timestamp: 1, blocks: [{ type: "text", text }] };
}

function fakeEndpoint() {
  let receive: ((message: unknown) => void) | undefined;
  const messages: unknown[] = [];
  return {
    messages,
    endpoint: {
      surface: { kind: "sidebar" },
      webview: {
        onDidReceiveMessage: (listener: (message: unknown) => void) => {
          receive = listener;
          return { dispose: () => { receive = undefined; } };
        },
        postMessage: vi.fn((message: unknown) => {
          messages.push(message);
          return Promise.resolve(true);
        }),
      },
      isVisible: () => true,
      onDidChangeVisibility: () => ({ dispose: () => undefined }),
    },
    receive: (message: unknown) => receive?.(message),
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("streaming a long turn from the host to the Webview", () => {
  it("keeps the Webview identical to the host while sending a fraction of the old traffic", async () => {
    const finished = userTurn([tool("old-1"), response("done")], "completed", "turn-0");
    let items: ConversationItemView[] = [finished];
    const view = () => ({
      id: "s1",
      title: "S1",
      status: "running",
      cwd: "/w",
      conversationItems: items,
    });
    const registry = {
      activeSessionId: "s1",
      sessionView: () => view(),
      snapshot: () => ({
        workspaceName: "w",
        workspacePath: "/w",
        sessions: [],
        activeSessionId: "s1",
        activeSession: view(),
        piAvailable: true,
      }),
      extensionVersion: "test",
    };
    const endpoint = fakeEndpoint();
    const connection = new WebviewConnection(
      registry as never,
      endpoint.endpoint as never,
      { dispatch: vi.fn() } as never,
      { get: () => ({ revision: 0, text: "", images: [] }), getIfPresent: () => null } as never,
      { error: vi.fn(), info: vi.fn() } as never,
      () => false,
      () => false,
    );

    endpoint.receive({ type: "ready", bridgeVersion: BRIDGE_VERSION });
    await flush();
    let applied = 0;
    const drain = (): void => {
      for (; applied < endpoint.messages.length; applied += 1) {
        const message = endpoint.messages[applied] as { type: string };
        if (message.type !== "setChatTypography") applyHostMessage(message as never);
      }
    };
    drain();
    const webviewItems = (): unknown => get(presentationStore).displayedSession?.conversationItems;
    expect(webviewItems()).toEqual(items);

    const afterSnapshot = endpoint.messages.length;
    let oldProtocolBytes = 0;
    const activities: AgentTurnItemView[] = [];
    for (let step = 0; step < 60; step += 1) {
      if (step % 10 === 0) activities.push(tool(`tool-${step}`));
      const running = userTurn([...activities, response("token ".repeat(step + 1))], step === 59 ? "completed" : "running", "turn-1");
      items = [finished, running];
      oldProtocolBytes += JSON.stringify(running).length;
      connection.refresh();
      await flush();
      drain();
      expect(webviewItems()).toEqual(items);
    }

    const newBytes = endpoint.messages.slice(afterSnapshot).reduce<number>((sum, message) => sum + JSON.stringify(message).length, 0);
    expect(newBytes).toBeLessThan(oldProtocolBytes * 0.05);
    const wire = endpoint.messages.slice(afterSnapshot).map((message) => JSON.stringify(message)).join("");
    expect(wire.split(SCREENSHOT.slice(0, 40)).length - 1).toBeLessThanOrEqual(1);

    const finishedOnWebview = (webviewItems() as ConversationItemView[])[0];
    expect(finishedOnWebview).toEqual(finished);
    connection.dispose();
  });
});
