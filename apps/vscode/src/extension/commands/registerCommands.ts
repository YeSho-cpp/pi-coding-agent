import * as vscode from "vscode";

import { captureActiveFileReference } from "../composer/mentions/captureActiveFile.js";
import { captureActiveSelection } from "../composer/mentions/captureSelection.js";
import { configurePiExecutable } from "../configuration/configurePiExecutable.js";
import { exportDiagnostics } from "../diagnostics/exportDiagnostics.js";
import type { DiagnosticLogger } from "../diagnostics/DiagnosticLogger.js";
import { configureProxy, configureProxyCredentials } from "../network/configureProxy.js";
import { ProxySecretStore } from "../network/ProxySecretStore.js";
import type { SessionRegistry } from "../sessions/SessionRegistry.js";
import type { PiViewProvider } from "../webview-host/PiViewProvider.js";
import type { SessionWebviewCoordinator } from "../webview-host/SessionWebviewCoordinator.js";

export function registerCommands(
  context: vscode.ExtensionContext,
  registry: SessionRegistry,
  viewProvider: PiViewProvider,
  coordinator: SessionWebviewCoordinator,
  logger: DiagnosticLogger,
): void {
  const proxySecrets = new ProxySecretStore(context.secrets);
  context.subscriptions.push(
    vscode.commands.registerCommand("piAgent.focus", () => viewProvider.reveal()),
    vscode.commands.registerCommand("piAgent.newSession", async () => {
      const sessionId = await registry.createSession();
      if (sessionId) await viewProvider.reveal();
    }),
    vscode.commands.registerCommand("piAgent.resumeSession", async () => {
      const sessionId = await registry.resumeSession();
      if (sessionId) await viewProvider.reveal();
    }),
    vscode.commands.registerCommand("piAgent.sendSelection", async () => {
      const text = captureActiveSelection();
      if (!text) {
        void vscode.window.showWarningMessage("Open a workspace file first.");
        return;
      }
      await coordinator.insertEditorReference(`${text} `);
    }),
    vscode.commands.registerCommand("piAgent.sendFile", async () => {
      const text = captureActiveFileReference();
      if (!text) {
        void vscode.window.showWarningMessage("Open a workspace file first.");
        return;
      }
      await coordinator.insertEditorReference(`${text} `);
    }),
    vscode.commands.registerCommand("piAgent.stop", () => registry.abort()),
    vscode.commands.registerCommand("piAgent.restartSession", () => registry.retrySession()),
    vscode.commands.registerCommand("piAgent.restartAllSessions", () => registry.restartAllSessions()),
    vscode.commands.registerCommand("piAgent.configureProxy", () => configureProxy(registry, proxySecrets)),
    vscode.commands.registerCommand("piAgent.configureProxyCredentials", () => configureProxyCredentials(registry, proxySecrets)),
    vscode.commands.registerCommand("piAgent.exportDiagnostics", () => exportDiagnostics(logger, registry.diagnosticsSummary())),
    vscode.commands.registerCommand("piAgent.configureExecutable", () => configurePiExecutable()),
  );
}
