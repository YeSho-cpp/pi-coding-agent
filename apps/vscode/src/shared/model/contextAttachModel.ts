export type ContextAttachKind = "file" | "selection" | "folder";

/** Path-only context chip. Pi Coding Agent never injects file bodies; Pi reads paths. */
export interface ContextAttachItemView {
  id: string;
  kind: ContextAttachKind;
  /** Absolute filesystem path — sent to Pi as-is, never resolved against the session cwd */
  path: string;
  /** Selection only */
  startLine?: number;
  endLine?: number;
  /** Short chip label */
  label: string;
  /** Markdown code-span reference inserted into the prompt on send */
  insertText: string;
  /** Optional Material-icon SVG data URI for chip avatar */
  iconDataUri?: string;
}

export function formatContextAttachLabel(item: Omit<ContextAttachItemView, "id" | "label"> & { label?: string }): string {
  if (item.label) return item.label;
  if (item.kind === "selection" && item.startLine != null && item.endLine != null) {
    return `${item.path}:${item.startLine}-${item.endLine}`;
  }
  return item.path;
}
