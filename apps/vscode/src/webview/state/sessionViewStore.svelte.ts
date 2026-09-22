import { writable } from "svelte/store";

import type { WebviewPresentationView } from "$shared/model/webviewPresentationModel";
import type { McpServerView } from "$shared/model/mcpModel";

export const EMPTY_PRESENTATION: WebviewPresentationView = {
  surface: { kind: "sidebar" },
  workspaceName: "",
  workspacePath: "",
  sessions: [],
  activeSessionId: null,
  displayedSession: null,
  composerDraftAuthority: "webview",
  sidebarSessionExternalized: false,
  piAvailable: true,
};

export const presentationStore = writable<WebviewPresentationView>(EMPTY_PRESENTATION);
export const composerFocusTick = writable(0);
/** True while the welcome list is opening a session — avoids flashing the welcome UI. */
export const pendingSessionOpen = writable(false);

export interface WelcomeResourcesView {
  version: string;
  skills: string[];
  extensions: string[];
  skillsPaths: string[];
  extensionsPaths: string[];
}
export const welcomeResources = writable<WelcomeResourcesView | null>(null);

export interface McpServersView {
  sessionId: string;
  servers: McpServerView[];
  /** Set when a config file exists but could not be read or parsed. */
  warning?: string;
}
/** Last MCP read for the displayed session; null until the panel asks for one. */
export const mcpServers = writable<McpServersView | null>(null);

export interface ToastItem {
  id: number;
  level: "info" | "warning" | "error";
  message: string;
}

export const toastStore = writable<ToastItem[]>([]);
let toastId = 0;

export function showToast(level: ToastItem["level"], message: string): void {
  const id = ++toastId;
  toastStore.update((items) => [...items, { id, level, message }].slice(-4));
  window.setTimeout(() => toastStore.update((items) => items.filter((item) => item.id !== id)), 5_000);
}
