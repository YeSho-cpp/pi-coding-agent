import { writable } from "svelte/store";

export interface EditorContextHintView {
  available: boolean;
  hasSelection: boolean;
  path?: string;
  startLine?: number;
  endLine?: number;
  label?: string;
  /** Host-provided chip state when present */
  attached?: boolean;
  /** Material icon SVG data URI */
  iconDataUri?: string;
}

export const editorContextHint = writable<EditorContextHintView>({
  available: false,
  hasSelection: false,
});

/** true = chip is attached (sent to Pi); false = inactive ghost chip */
export const editorChipAttached = writable(true);

/** true = hide editor chip entirely (Clear); reappears on next file/selection change */
export const editorChipDismissed = writable(false);

let lastKey = "";

function hintKey(hint: EditorContextHintView): string {
  if (!hint.available || !hint.path) return "none";
  return `${hint.path}:${hint.hasSelection ? `${hint.startLine}-${hint.endLine}` : "file"}`;
}

export function applyEditorContextHint(hint: EditorContextHintView): void {
  const key = hintKey(hint);
  if (key !== lastKey) {
    // New file / new selection (or editor closed) → chip visible again
    editorChipDismissed.set(key === "none");
  }
  if (hint.attached !== undefined) {
    editorChipAttached.set(hint.attached);
  } else if (key !== lastKey) {
    if (!hint.available || !hint.path) {
      editorChipAttached.set(false);
    } else if (
      lastKey !== "none"
      && lastKey.startsWith(`${hint.path}:`)
      && lastKey !== `${hint.path}:file`
      && !hint.hasSelection
    ) {
      // Selection cleared on the same file (Esc / click) → ghost file chip
      editorChipAttached.set(false);
    } else {
      // New file or new selection → default active
      editorChipAttached.set(true);
    }
  }
  lastKey = key;
  editorContextHint.set(hint);
}

/** Esc / X → not attached; chip stays as faded file ghost if a file is open. */
export function deactivateEditorChip(): void {
  editorChipAttached.set(false);
}

export function activateEditorChip(): void {
  editorChipDismissed.set(false);
  editorChipAttached.set(true);
}

/** Clear: hide editor chip until the next editor file/selection change. */
export function dismissEditorChip(): void {
  editorChipAttached.set(false);
  editorChipDismissed.set(true);
}

/** Markdown tokens for send — only when attached. */
export function editorChipPromptText(hint: EditorContextHintView, attached: boolean): string {
  if (!attached || !hint.available || !hint.path) return "";
  if (hint.hasSelection && hint.startLine != null) {
    const end = hint.endLine ?? hint.startLine;
    return `\`${hint.path}:${hint.startLine}-${end}\``;
  }
  return `\`${hint.path}\``;
}

export function editorChipDisplayLabel(hint: EditorContextHintView, attached: boolean): string {
  if (!hint.available || !hint.path) return "";
  const base = hint.path.split("/").pop() || hint.path;
  if (attached && hint.hasSelection && hint.startLine != null) {
    const end = hint.endLine ?? hint.startLine;
    return `${base}:${hint.startLine}-${end}`;
  }
  return base;
}
