/**
 * OpenChamber-style save-as-image for Pi Coding Agent.
 *
 * OpenChamber: toPng(live DOM, { quality:1, pixelRatio:2, backgroundColor }) → host save.
 * VS Code webview often fails CSS-var / foreignObject capture → always fall back
 * to an explicit-color canvas so the PNG is never an empty black frame.
 */
import { toPng } from "html-to-image";

import { postToHost } from "../../bridge/vscodeBridge";
import { createId } from "../../utils/createId";
import { rawMessageText } from "./copyMessageClient";
import type { MessageBlockView } from "$shared/model/conversationModel";

const OC_BG = "#151313";
const OC_CARD = "#1c1b1a";
const OC_TEXT = "#cdccc3";
const OC_MUTED = "#b6b4ab";
const OC_MONO = "#9ece6a";
const OC_GOLD = "#edb449";

export interface SaveAsImageOptions {
  element: HTMLElement;
  fileName?: string;
  backgroundColor?: string;
  pixelRatio?: number;
}

function isUsablePng(dataUrl: string): boolean {
  if (!dataUrl.startsWith("data:image/png;base64,")) return false;
  // Tiny payloads are empty/clear bitmaps (common when foreignObject capture fails).
  return dataUrl.length > 4000;
}

export async function captureElementAsPng(options: SaveAsImageOptions): Promise<string> {
  const { element, pixelRatio = 2 } = options;
  const backgroundColor = OC_BG;

  // 1) OpenChamber path: capture the LIVE node (CSS variables still resolve).
  try {
    const dataUrl = await toPng(element, {
      quality: 1,
      pixelRatio,
      backgroundColor,
      cacheBust: true,
      filter: (node: HTMLElement) => {
        if (!(node instanceof Element)) return true;
        if (node.classList?.contains("message-actions")) return false;
        if (node.classList?.contains("response-actions")) return false;
        if (node.classList?.contains("save-as-image-btn")) return false;
        if (node.classList?.contains("text-selection-menu")) return false;
        return true;
      },
    });
    if (isUsablePng(dataUrl)) return dataUrl;
  } catch {
    // fall through
  }

  // 2) Explicit-color canvas fallback — never blank.
  return captureTextAsPng(element, backgroundColor);
}

function captureTextAsPng(element: HTMLElement, backgroundColor: string): string {
  const text =
    (element.querySelector("[data-message-snapshot]") as HTMLElement | null)?.innerText
    || element.innerText
    || element.textContent
    || "";

  const width = 760;
  const padding = 28;
  const lineHeight = 22;
  const font = '14px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  const mono = '12.5px "SF Mono", Menlo, Consolas, monospace';
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return "";

  const lines: Array<{ text: string; mono: boolean }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const isMono = /^\s{2,}/.test(raw) || /^[$>#|]/.test(raw.trim()) || /\.(py|md|log|json|toml|ts|tsx)\b/.test(raw);
    measure.font = isMono ? mono : font;
    const maxChars = Math.floor((width - padding * 2) / (isMono ? 7.4 : 8.6));
    if (!raw) {
      lines.push({ text: "", mono: isMono });
      continue;
    }
    let rest = raw;
    while (rest.length > maxChars) {
      lines.push({ text: rest.slice(0, maxChars), mono: isMono });
      rest = rest.slice(maxChars);
    }
    lines.push({ text: rest, mono: isMono });
  }

  const height = Math.min(4200, padding * 2 + 48 + lines.length * lineHeight);
  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(dpr, dpr);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = OC_CARD;
  ctx.fillRect(12, 12, width - 24, height - 24);
  ctx.strokeStyle = "#393836";
  ctx.strokeRect(12.5, 12.5, width - 25, height - 25);
  ctx.fillStyle = OC_GOLD;
  ctx.fillRect(12, 12, width - 24, 3);
  ctx.fillStyle = OC_MUTED;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`Pi · ${new Date().toLocaleString()}`, padding, 36);

  let y = 64;
  for (const line of lines) {
    ctx.font = line.mono ? mono : font;
    ctx.fillStyle = line.mono ? OC_MONO : OC_TEXT;
    ctx.fillText(line.text, padding, y);
    y += lineHeight;
  }
  return canvas.toDataURL("image/png");
}

export async function saveElementAsImage(options: SaveAsImageOptions): Promise<void> {
  const { element, fileName } = options;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = (fileName || `frost-ui-${timestamp}`).replace(/[^\w.-]+/g, "_").slice(0, 120);
  const dataUrl = await captureElementAsPng(options);
  if (!dataUrl) throw new Error("Failed to capture message as image");
  postToHost({
    type: "saveImage",
    requestId: createId("img"),
    fileName: name.endsWith(".png") ? name : `${name}.png`,
    dataUrl,
  });
}

export async function saveMessageElementAsImage(
  root: HTMLElement | null,
  opts?: { fileName?: string },
): Promise<void> {
  const target =
    root?.querySelector<HTMLElement>("[data-message-snapshot]")
    || root?.querySelector<HTMLElement>(".message-content")
    || root;
  if (!target) return;
  await saveElementAsImage({
    element: target,
    ...(opts?.fileName !== undefined ? { fileName: opts.fileName } : {}),
  });
}

export function messageBlocksPreview(blocks: readonly MessageBlockView[]): string {
  return rawMessageText(blocks);
}
