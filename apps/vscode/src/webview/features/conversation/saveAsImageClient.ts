import type { MessageBlockView } from "$shared/model/conversationModel";

import { postToHost } from "../../bridge/vscodeBridge";
import { rawMessageText } from "./copyMessageClient";
import { createId } from "../../utils/createId";

/** Render assistant/user text to PNG (OpenChamber-style answer snapshot) and save via Host. */
export async function saveBlocksAsImage(blocks: readonly MessageBlockView[], label = "frost-ui-answer"): Promise<void> {
  const text = rawMessageText(blocks).trim();
  if (!text) return;

  const width = 760;
  const padding = 28;
  const lineHeight = 22;
  const font = '14px "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  const mono = '12px "SF Mono", Menlo, Consolas, monospace';

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return;

  const lines: Array<{ text: string; mono: boolean }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const isMono = /^\s{4}/.test(raw) || raw.startsWith("```");
    measure.font = isMono ? mono : font;
    const maxChars = Math.floor((width - padding * 2) / (isMono ? 7.2 : 8.2));
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

  const height = Math.min(4000, padding * 2 + 36 + lines.length * lineHeight);
  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  // OpenChamber warm dark
  ctx.fillStyle = "#151313";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#edb449";
  ctx.fillRect(0, 0, width, 4);
  ctx.fillStyle = "#b6b4ab";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`Pi · Pi · ${new Date().toLocaleString()}`, padding, 28);
  ctx.strokeStyle = "#393836";
  ctx.beginPath();
  ctx.moveTo(padding, 40);
  ctx.lineTo(width - padding, 40);
  ctx.stroke();

  let y = 64;
  for (const line of lines) {
    ctx.font = line.mono ? mono : font;
    ctx.fillStyle = line.mono ? "#9ece6a" : "#cdccc3";
    ctx.fillText(line.text, padding, y);
    y += lineHeight;
  }

  const dataUrl = canvas.toDataURL("image/png");
  const requestId = createId("img");
  postToHost({
    type: "saveImage",
    requestId,
    fileName: `${label}-${Date.now()}.png`,
    dataUrl,
  });
}
