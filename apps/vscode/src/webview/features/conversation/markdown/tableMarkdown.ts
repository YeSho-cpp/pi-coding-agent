/**
 * Clipboard payload for the table Copy button: a complete GFM table — header row,
 * the mandatory `---` delimiter, then body rows — with edge pipes so every renderer
 * (GitHub, Feishu, VS Code preview) treats the paste as a table. Without the
 * delimiter row the paste degrades to plain text lines.
 */
export function tableToMarkdown(table: Element): string {
  const rows = [...table.querySelectorAll("tr")];
  if (!rows.length) return "";
  const cells = rows.map((row) =>
    [...row.querySelectorAll("th,td")].map((cell) => (cell.textContent ?? "").trim().replaceAll("|", "\\|")),
  );
  const width = Math.max(...cells.map((row) => row.length));
  if (!width) return "";
  const line = (row: string[]): string =>
    `| ${Array.from({ length: width }, (_, index) => row[index] ?? "").join(" | ")} |`;
  const delimiter = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
  return [line(cells[0]!), delimiter, ...cells.slice(1).map(line)].join("\n");
}
