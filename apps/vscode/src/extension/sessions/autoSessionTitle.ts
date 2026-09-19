/** Derive a short session title from the first user prompt (auto-rename). */

const DEFAULT_TITLES = new Set([
  "",
  "untitled session",
  "new session",
  "new chat",
  "session",
  "临时会话",
  "新会话",
]);

export function isDefaultSessionTitle(title: string | undefined | null): boolean {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  if (DEFAULT_TITLES.has(t)) return true;
  // Timestamp-ish titles Frost/pi may assign on new sessions
  if (/^\d{4}[-t]/.test(t) && t.length <= 32) return true;
  if (t.startsWith("session-") || t.startsWith("untitled")) return true;
  return false;
}

/** First-line summary suitable for a session title. */
export function deriveSessionTitle(prompt: string, maxLength = 48): string {
  let t = (prompt ?? "").trim();
  if (!t) return "";
  // Drop leading slash / shell / skill prefixes
  t = t.replace(/^!!?\s*/, "").replace(/^\/[\w:.-]+\s*/, "");
  // Mention chips → keep path tail only
  t = t.replace(/`([^`]+)`/g, (_m, p1: string) => {
    const parts = String(p1).split(/[\\/]/);
    return parts[parts.length - 1] || p1;
  });
  t = t.replace(/[#*_>~\[\]()]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "";
  // Cut at first sentence boundary when reasonable
  const stop = t.search(/[.!?。！？;；]/);
  if (stop >= 12 && stop <= maxLength + 20) {
    t = t.slice(0, stop + 1).trim();
  }
  if (t.length > maxLength) {
    t = t.slice(0, maxLength - 1).trimEnd() + "…";
  }
  return t;
}
