/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import { tableToMarkdown } from "../../src/webview/features/conversation/markdown/tableMarkdown";

function parse(html: string): Element {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root.querySelector("table")!;
}

describe("tableToMarkdown", () => {
  it("emits a complete GFM table with the delimiter row and edge pipes", () => {
    const table = parse(`
      <table>
        <tr><th>大小</th><th>t1 µs</th><th>algbw</th></tr>
        <tr><td>2K</td><td>192.0</td><td>0.01</td></tr>
        <tr><td>4M</td><td>15522.9</td><td>14.61</td></tr>
      </table>
    `);

    expect(tableToMarkdown(table)).toBe(
      [
        "| 大小 | t1 µs | algbw |",
        "| --- | --- | --- |",
        "| 2K | 192.0 | 0.01 |",
        "| 4M | 15522.9 | 14.61 |",
      ].join("\n"),
    );
  });

  it("escapes pipes inside cells and pads ragged rows to the header width", () => {
    const table = parse(`
      <table>
        <tr><th>a</th><th>b</th><th>c</th></tr>
        <tr><td>x|y</td><td>z</td></tr>
      </table>
    `);

    expect(tableToMarkdown(table)).toBe(
      [
        "| a | b | c |",
        "| --- | --- | --- |",
        "| x\\|y | z |  |",
      ].join("\n"),
    );
  });

  it("returns nothing for an empty table", () => {
    expect(tableToMarkdown(parse("<table></table>"))).toBe("");
  });
});
