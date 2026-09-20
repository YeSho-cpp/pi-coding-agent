import * as vscode from "vscode";

import type { ComposerDraftView } from "../../shared/model/composerDraftModel.js";
import type { ContextAttachItemView } from "../../shared/model/contextAttachModel.js";
import { ComposerExternalEditor } from "../composer/ComposerExternalEditor.js";
import { captureContextItemsForHint } from "../composer/mentions/contextAttachPicker.js";
import { materialIconDataUri } from "../composer/mentions/materialIcons.js";
import { readChatTypography } from "../configuration/readChatTypography.js";
import type { DiagnosticLogger } from "../diagnostics/DiagnosticLogger.js";
import type { SessionRegistry } from "../sessions/SessionRegistry.js";
import { ComposerDraftCache } from "./ComposerDraftCache.js";
import { SessionPanelManager } from "./SessionPanelManager.js";
import { WebviewActionDispatcher } from "./WebviewActionDispatcher.js";
import { WebviewConnection } from "./WebviewConnection.js";
import type { WebviewEndpoint } from "./webviewTypes.js";

export interface ReferenceDestination {
  sessionId: string;
  title: string;
  cwd: string;
  workingDirectoryLabel?: string;
  externalized: boolean;
}

export class SessionWebviewCoordinator implements vscode.Disposable {
  readonly #registry: SessionRegistry;
  readonly #logger: DiagnosticLogger;
  readonly #drafts = new ComposerDraftCache();
  readonly #externalEditor: ComposerExternalEditor;
  readonly #dispatcher: WebviewActionDispatcher;
  readonly #panels: SessionPanelManager;
  readonly #disposables: vscode.Disposable[] = [];
  #sidebar: WebviewConnection | null = null;
  #knownSessionIds: Set<string>;
  #externalizedSessionIds = new Set<string>();
  #pendingSidebarComposerText = new Map<string, string>();

  constructor(registry: SessionRegistry, logger: DiagnosticLogger, extensionUri: vscode.Uri) {
    this.#registry = registry;
    this.#logger = logger;
    this.#knownSessionIds = new Set(registry.snapshot().sessions.map((session) => session.id));
    this.#externalEditor = new ComposerExternalEditor(
      ({ sessionId, text }) => this.#applyExternalEditorText(sessionId, text),
    );
    this.#dispatcher = new WebviewActionDispatcher({
      registry,
      logger,
      drafts: this.#drafts,
      openPanel: (sessionId, draft) => this.openPanel(sessionId, draft),
      revealPanel: (sessionId) => this.revealPanel(sessionId),
      openComposerEditor: (sessionId, text) => this.#externalEditor.open(sessionId, text),
      setEditorChipAttached: (attached) => this.#setEditorChipAttached(attached),
    });
    this.#panels = new SessionPanelManager(
      registry,
      extensionUri,
      (endpoint) => this.#createConnection(endpoint),
    );
    this.#disposables.push(
      registry.onDidChange(() => this.#registryChanged()),
      registry.onDidToast((toast) => this.#sidebar?.post({ type: "toast", ...toast })),
      registry.onDidSetComposerText(({ sessionId, text }) => this.#routeComposerText(sessionId, text)),
      this.#drafts.onDidChange(({ sessionId, draft }) => this.#draftChanged(sessionId, draft)),
      this.#drafts.onDidOwnershipChange(() => this.#refreshConnections()),
      this.#panels.onDidChange(() => this.#panelsChanged()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!chatTypographyChanged(event)) return;
        // A full refresh is unnecessary; each ready Webview can accept typography independently.
        this.#forEachConnection((connection) => connection.post({
          type: "setChatTypography",
          typography: readChatTypography(vscode.workspace.getConfiguration("chat")),
        }));
      }),
      this.#externalEditor,
      this.#drafts,
      this.#panels,
    );

    // Active editor file/selection → composer chip (debounced — selection fires very often).
    this.#disposables.push(
      vscode.window.onDidChangeTextEditorSelection(() => this.#scheduleEditorContextHint()),
      vscode.window.onDidChangeActiveTextEditor(() => this.#scheduleEditorContextHint(0)),
      vscode.commands.registerCommand("piAgent.attachEditorSelection", async () => {
        const items = await captureContextItemsForHint("selection");
        if (!items.length) {
          vscode.window.showInformationMessage("Open a workspace file in the editor first.");
          return;
        }
        this.#broadcastContextAttach(items);
        this.#setEditorChipAttached(true);
      }),
      vscode.commands.registerCommand("piAgent.attachEditorFile", async () => {
        const items = await captureContextItemsForHint("file");
        if (!items.length) {
          vscode.window.showInformationMessage("Open a workspace file in the editor first.");
          return;
        }
        this.#broadcastContextAttach(items);
        this.#setEditorChipAttached(true);
      }),
      vscode.commands.registerCommand("piAgent.deactivateEditorChip", () => {
        this.#setEditorChipAttached(false);
      }),
      vscode.commands.registerCommand("piAgent.activateEditorChip", () => {
        this.#setEditorChipAttached(true);
      }),
    );
    this.#publishEditorContextHint();
  }

  #editorChipAttached = true;
  #lastEditorChipKey = "";
  #editorHintTimer: ReturnType<typeof setTimeout> | null = null;

  #scheduleEditorContextHint(delayMs = 200): void {
    if (this.#editorHintTimer) clearTimeout(this.#editorHintTimer);
    this.#editorHintTimer = setTimeout(() => {
      this.#editorHintTimer = null;
      this.#publishEditorContextHint();
    }, delayMs);
  }

  #setEditorChipAttached(attached: boolean): void {
    const hint = this.#lastEditorChipHint;
    const available = Boolean(hint?.path);
    this.#editorChipAttached = attached && available;
    this.#syncEditorChipContextKey();
    this.#forEachConnection((connection) => connection.post({
      type: "editorContextHint",
      available,
      attached: this.#editorChipAttached,
      ...(hint ?? {}),
    }));
  }

  #lastEditorChipHint: {
    path?: string;
    startLine?: number;
    endLine?: number;
    label?: string;
    hasSelection?: boolean;
    iconDataUri?: string;
  } | null = null;

  #syncEditorChipContextKey(): void {
    const active = this.#editorChipAttached && Boolean(this.#lastEditorChipHint?.path);
    void vscode.commands.executeCommand("setContext", "piAgent.editorChipActive", active);
  }

  #broadcastContextAttach(items: ContextAttachItemView[]): void {
    const sessionId = this.#registry.activeSessionId ?? undefined;
    this.#forEachConnection((connection) => connection.post({
      type: "contextAttachPicked",
      items,
      ...(sessionId ? { sessionId } : {}),
    }));
  }

  #publishEditorContextHint(): void {
    const editor = vscode.window.activeTextEditor;
    const post = (message: Parameters<WebviewConnection["post"]>[0]): void => {
      this.#forEachConnection((connection) => connection.post(message));
    };

    if (!editor || editor.document.uri.scheme !== "file") {
      this.#lastEditorChipHint = null;
      this.#lastEditorChipKey = "none";
      this.#editorChipAttached = false;
      this.#syncEditorChipContextKey();
      post({ type: "editorContextHint", available: false, attached: false });
      return;
    }

    const relative = vscode.workspace.asRelativePath(editor.document.uri, false);
    const isEmpty = editor.selection.isEmpty;
    const startLine = editor.selection.start.line + 1;
    const endLine = isEmpty ? startLine : editor.selection.end.line + 1;
    const baseName = relative.split("/").pop() || relative;
    const hasSelection = !isEmpty;
    const key = `${relative}:${hasSelection ? `${startLine}-${endLine}` : "file"}`;

    if (key !== this.#lastEditorChipKey) {
      const prev = this.#lastEditorChipKey;
      if (prev !== "none" && prev.startsWith(`${relative}:`) && prev !== `${relative}:file` && isEmpty) {
        // Selection cleared on the same file (Esc / click away) → inactive ghost file chip
        this.#editorChipAttached = false;
      } else {
        // New open file or new selection → default active
        this.#editorChipAttached = true;
      }
    }
    this.#lastEditorChipKey = key;
    const iconDataUri = materialIconDataUri(baseName, false);
    this.#lastEditorChipHint = {
      path: relative,
      startLine,
      endLine,
      label: isEmpty ? baseName : `${baseName}:${startLine}-${endLine}`,
      hasSelection,
      ...(iconDataUri ? { iconDataUri } : {}),
    };
    this.#syncEditorChipContextKey();

    post({
      type: "editorContextHint",
      available: true,
      attached: this.#editorChipAttached,
      hasSelection,
      path: relative,
      startLine,
      endLine,
      label: isEmpty ? baseName : `${baseName}:${startLine}-${endLine}`,
      ...(iconDataUri ? { iconDataUri } : {}),
    });
  }

  #contextAttachStatus: vscode.StatusBarItem | undefined;

  attachSidebar(endpoint: WebviewEndpoint): void {
    this.#sidebar?.dispose();
    this.#sidebar = this.#createConnection(endpoint);
    for (const [sessionId, text] of this.#pendingSidebarComposerText) {
      this.#queueSidebarComposerText(sessionId, text);
    }
    // One-shot welcome scans (throttled inside registry). Never on every registry event.
    void (this.#registry as unknown as { refreshWelcomeLists?: () => void }).refreshWelcomeLists?.();
  }

  detachSidebar(): void {
    this.#sidebar?.dispose();
    this.#sidebar = null;
  }

  openPanel(sessionId: string, draft?: ComposerDraftView): void {
    if (this.#panels.has(sessionId)) {
      this.#panels.open(sessionId);
      return;
    }
    const pendingText = this.#pendingSidebarComposerText.get(sessionId);
    const handoffDraft = draft && pendingText !== undefined
      ? { ...draft, revision: draft.revision + 1, text: pendingText }
      : draft;
    if (pendingText !== undefined) this.#pendingSidebarComposerText.delete(sessionId);
    const rollbackDraft = handoffDraft ? this.#drafts.beginHandoff(sessionId, handoffDraft) : undefined;
    try {
      this.#panels.open(sessionId);
    } catch (error) {
      rollbackDraft?.();
      if (pendingText !== undefined) this.#queueSidebarComposerText(sessionId, pendingText);
      throw error;
    }
  }

  revealPanel(sessionId: string): void {
    this.#panels.reveal(sessionId);
  }

  focusSidebarComposer(): void {
    this.#sidebar?.focusComposer();
  }

  async insertEditorReference(text: string): Promise<void> {
    const candidates = this.#referenceCandidates();
    if (!candidates.length) {
      await vscode.commands.executeCommand("piAgent.focus");
      return;
    }
    const selected = candidates.length === 1
      ? candidates[0]
      : await vscode.window.showQuickPick(referenceDestinationItems(candidates), {
          title: "Insert file reference into Pi session",
          placeHolder: "Choose the destination Session",
          ignoreFocusOut: true,
        }).then((item) => item?.candidate);
    if (!selected) return;

    if (selected.externalized) {
      this.#panels.connection(selected.sessionId)?.insertPromptText(text);
      this.#panels.reveal(selected.sessionId);
      return;
    }
    await vscode.commands.executeCommand("piAgent.focus");
    this.#sidebar?.insertPromptText(text);
  }

  dispose(): void {
    if (this.#editorHintTimer) {
      clearTimeout(this.#editorHintTimer);
      this.#editorHintTimer = null;
    }
    this.#contextAttachStatus?.dispose();
    this.#contextAttachStatus = undefined;
    void vscode.commands.executeCommand("setContext", "piAgent.editorChipActive", false);
    this.#sidebar?.dispose();
    this.#sidebar = null;
    for (const disposable of this.#disposables) disposable.dispose();
  }

  #createConnection(endpoint: WebviewEndpoint): WebviewConnection {
    return new WebviewConnection(
      this.#registry,
      endpoint,
      this.#dispatcher,
      this.#drafts,
      this.#logger,
      (sessionId) => this.#panels.has(sessionId),
      (sessionId) => this.#hostOwnsDraft(sessionId),
    );
  }

  #registryChanged(): void {
    const currentIds = new Set(this.#registry.snapshot().sessions.map((session) => session.id));
    for (const sessionId of this.#knownSessionIds) {
      if (!currentIds.has(sessionId)) {
        this.#drafts.release(sessionId);
        this.#pendingSidebarComposerText.delete(sessionId);
      }
    }
    this.#knownSessionIds = currentIds;
    this.#panels.reconcileRegistry();
    this.#refreshConnections();
  }

  #refreshConnections(): void {
    this.#forEachConnection((connection) => connection.refresh());
  }

  #panelsChanged(): void {
    const currentSessionIds = new Set(this.#panels.sessionIds());
    for (const sessionId of this.#externalizedSessionIds) {
      if (!currentSessionIds.has(sessionId) && this.#registry.hasSession(sessionId)) {
        const draft = this.#drafts.getIfPresent(sessionId);
        if (draft) this.#sidebar?.post({ type: "draftReplacement", sessionId, draft });
      }
    }
    this.#externalizedSessionIds = currentSessionIds;
    this.#refreshConnections();
  }

  #draftChanged(sessionId: string, draft: ComposerDraftView): void {
    const panelConnection = this.#panels.connection(sessionId);
    if (panelConnection) panelConnection.draftChanged(sessionId);
    else this.#sidebar?.post({ type: "draftReplacement", sessionId, draft });
  }

  #forEachConnection(action: (connection: WebviewConnection) => void): void {
    if (this.#sidebar) action(this.#sidebar);
    for (const sessionId of this.#panels.sessionIds()) {
      const connection = this.#panels.connection(sessionId);
      if (connection) action(connection);
    }
  }

  #applyExternalEditorText(sessionId: string, text: string): void {
    if (!this.#registry.hasSession(sessionId)) return;
    if (this.#hostOwnsDraft(sessionId)) {
      this.#drafts.replaceText(sessionId, text);
      if (this.#panels.has(sessionId)) this.#panels.reveal(sessionId);
      else if (this.#registry.activeSessionId === sessionId) void this.#focusSidebarAfterExternalEdit();
      return;
    }
    this.#queueSidebarComposerText(sessionId, text);
    if (this.#registry.activeSessionId === sessionId) void this.#focusSidebarAfterExternalEdit();
  }

  #routeComposerText(sessionId: string, text: string): void {
    if (this.#hostOwnsDraft(sessionId)) {
      this.#drafts.replaceText(sessionId, text);
      const panelConnection = this.#panels.connection(sessionId);
      if (panelConnection) panelConnection.focusComposer();
      else if (this.#registry.activeSessionId === sessionId) this.#sidebar?.focusComposer();
      return;
    }
    this.#queueSidebarComposerText(sessionId, text);
    if (this.#registry.activeSessionId === sessionId) this.#sidebar?.focusComposer();
  }

  #hostOwnsDraft(sessionId: string): boolean {
    return this.#panels.has(sessionId) || this.#drafts.hasPendingSubmission(sessionId);
  }

  #queueSidebarComposerText(sessionId: string, text: string): void {
    this.#pendingSidebarComposerText.set(sessionId, text);
    this.#sidebar?.queueComposerText(sessionId, text, () => {
      if (this.#pendingSidebarComposerText.get(sessionId) === text) {
        this.#pendingSidebarComposerText.delete(sessionId);
      }
    });
  }

  async #focusSidebarAfterExternalEdit(): Promise<void> {
    try {
      await vscode.commands.executeCommand("piAgent.focus");
      this.#sidebar?.focusComposer();
    } catch (error) {
      this.#logger.error("Failed to reveal Composer destination", error);
    }
  }

  #referenceCandidates(): ReferenceDestination[] {
    const ids = new Set<string>();
    const candidates: ReferenceDestination[] = [];
    const activeId = this.#registry.activeSessionId;
    if (activeId) ids.add(activeId);
    for (const sessionId of this.#panels.sessionIds()) ids.add(sessionId);
    for (const sessionId of ids) {
      const session = this.#registry.sessionView(sessionId);
      if (session) candidates.push({
        sessionId,
        title: session.title,
        cwd: session.cwd,
        ...(session.workingDirectoryLabel ? { workingDirectoryLabel: session.workingDirectoryLabel } : {}),
        externalized: this.#panels.has(sessionId),
      });
    }
    return candidates;
  }
}

export function referenceDestinationItems(
  candidates: readonly ReferenceDestination[],
): Array<vscode.QuickPickItem & { candidate: ReferenceDestination }> {
  return candidates.map((candidate) => ({
    label: candidate.title,
    description: candidate.externalized ? "Session Tab" : "Pi sidebar",
    detail: candidate.workingDirectoryLabel
      ? `${candidate.workingDirectoryLabel} · ${candidate.cwd}`
      : candidate.cwd,
    candidate,
  }));
}

function chatTypographyChanged(event: vscode.ConfigurationChangeEvent): boolean {
  return event.affectsConfiguration("chat.fontFamily")
    || event.affectsConfiguration("chat.fontSize")
    || event.affectsConfiguration("chat.editor.fontFamily")
    || event.affectsConfiguration("chat.editor.fontSize");
}
