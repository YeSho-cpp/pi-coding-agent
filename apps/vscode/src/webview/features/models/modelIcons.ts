import { DEFAULT_MODEL_ICON, MODEL_ICONS, type ModelIconEntry } from "./model-icons-data";

export type { ModelIconEntry };

/** Match model id/name to a LobeHub vendor icon (prefix table, like pi-agent-studio). */
export function getModelIcon(modelName: string | null | undefined, provider?: string | null): ModelIconEntry {
  const raw = `${provider ?? ""} ${modelName ?? ""}`.toLowerCase();
  const id = String(modelName ?? "");
  const slash = id.indexOf("/");
  const short = (slash >= 0 ? id.slice(slash + 1) : id).toLowerCase();

  for (const entry of MODEL_ICONS) {
    for (const p of entry.prefixes) {
      const lp = p.toLowerCase();
      if (short.startsWith(lp) || raw.includes(lp)) return entry;
    }
  }
  return DEFAULT_MODEL_ICON;
}

/** Build inline SVG avatar HTML for webview (pi-agent-studio modelIconHtml). */
export function modelIconSvg(entry: ModelIconEntry | null | undefined): string {
  const icon = entry || DEFAULT_MODEL_ICON;
  const paths = icon.paths.map((d) => `<path d="${d}"></path>`).join("");
  return (
    `<span class="model-brand-avatar" title="${icon.title}" style="background:${icon.color}">` +
    `<svg viewBox="0 0 24 24" fill="#fff" fill-rule="evenodd" aria-hidden="true">${paths}</svg>` +
    `</span>`
  );
}
