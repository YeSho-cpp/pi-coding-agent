const MAX_PREVIEW = 140;

function plainLine(line: string): string {
  return line
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** One-line gist of a reasoning block; a streaming block shows its latest finished paragraph. */
export function reasoningPreview(text: string, streaming: boolean): string {
  const paragraphs = text.split(/\n\s*\n/);
  const finished = streaming && paragraphs.length > 1 ? paragraphs.slice(0, -1) : paragraphs;
  const source = streaming && paragraphs.length > 1 ? finished[finished.length - 1]! : finished[0] ?? "";
  for (const line of source.split("\n")) {
    const plain = plainLine(line);
    if (plain) return plain.length > MAX_PREVIEW ? `${plain.slice(0, MAX_PREVIEW)}…` : plain;
  }
  return "";
}
