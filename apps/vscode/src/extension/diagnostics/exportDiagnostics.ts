import * as vscode from "vscode";

import { redactDiagnosticText, type DiagnosticLogger } from "./DiagnosticLogger.js";

export async function exportDiagnostics(logger: DiagnosticLogger, sessionSummary: string): Promise<void> {
  const target = await vscode.window.showSaveDialog({
    title: "Export Pi Diagnostics",
    defaultUri: vscode.Uri.file(`pi-diagnostics-${new Date().toISOString().replaceAll(":", "-")}.txt`),
    filters: { "Text files": ["txt"] },
  });
  if (!target) return;
  const body = redactDiagnosticText(`${logger.contentsHeader()}\n\n${sessionSummary}\n`);
  await vscode.workspace.fs.writeFile(target, Buffer.from(body, "utf8"));
  void vscode.window.showInformationMessage("Pi diagnostics exported.");
}
