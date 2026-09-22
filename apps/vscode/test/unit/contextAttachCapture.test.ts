import { describe, expect, it, vi } from "vitest";

/**
 * The chip reference Pi receives must be absolute: a workspace-relative path is ambiguous in a
 * multi-root window, and Pi resolves references against the session cwd — which here is a
 * *different* folder than the file's. The mock's `asRelativePath` therefore lies on purpose.
 */

const ACTIVE_FILE = "/Users/yesho/Code/HPN/sanity-check/nccl_test/run_sanity_check.sh";

vi.mock("vscode", () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  ThemeIcon: class ThemeIcon {
    constructor(readonly id: string) {}
  },
  ColorThemeKind: { Light: 1, HighContrastLight: 4 },
  window: {
    activeColorTheme: { kind: 2 },
    activeTextEditor: {
      document: { uri: { scheme: "file", fsPath: "/Users/yesho/Code/HPN/sanity-check/nccl_test/run_sanity_check.sh" } },
      selection: {
        isEmpty: false,
        start: { line: 9 },
        end: { line: 11 },
        active: { line: 9 },
      },
    },
  },
  workspace: {
    workspaceFolders: [],
    // Deliberately misleading, as a multi-root window can be.
    asRelativePath: () => "nccl_test/run_sanity_check.sh",
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  },
  extensions: { getExtension: () => undefined },
}));

import { captureActiveFileReference } from "../../src/extension/composer/mentions/captureActiveFile.js";
import { captureActiveSelection } from "../../src/extension/composer/mentions/captureSelection.js";
import { captureContextItems } from "../../src/extension/composer/mentions/contextAttachPicker.js";
import { listEditorMentionSpecials } from "../../src/extension/composer/mentions/editorMentionSpecials.js";

describe("context chips carry absolute paths", () => {
  it("attaches the active file by absolute path, keeping the short label", () => {
    const chip = captureContextItems("file")[0]!;

    expect(chip.path).toBe(ACTIVE_FILE);
    expect(chip.label).toBe("run_sanity_check.sh");
    expect(chip.insertText).toBe(`\`${ACTIVE_FILE}\``);
  });

  it("attaches a selection by absolute path with the line range", () => {
    const chip = captureContextItems("selection")[0]!;

    expect(chip.path).toBe(ACTIVE_FILE);
    expect(chip.label).toBe("run_sanity_check.sh:10-12");
    expect(chip.insertText).toBe(`\`${ACTIVE_FILE}:10-12\``);
  });

  it("formats the current-file and selection references as absolute", () => {
    expect(captureActiveFileReference()).toBe(`\`${ACTIVE_FILE}\``);
    expect(captureActiveSelection()).toBe(`\`${ACTIVE_FILE}:10-12\``);
  });

  it("inserts absolute references from the @ specials list", () => {
    const specials = listEditorMentionSpecials("");

    expect(specials).toHaveLength(2);
    for (const special of specials) {
      expect(special.insertText).toContain(ACTIVE_FILE);
      expect(special.insertText).not.toContain("`nccl_test/run_sanity_check.sh`");
    }
  });
});
