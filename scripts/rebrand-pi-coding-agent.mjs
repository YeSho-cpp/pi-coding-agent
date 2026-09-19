#!/usr/bin/env node
/**
 * Rebrand Frost UI → Pi Coding Agent across the VS Code extension.
 * Internal command/settings ids: frostui.* → piAgent.*
 * Display strings: Frost UI → Pi / Pi Coding Agent.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "/Users/yesho/Code/frost-ui/apps/vscode";
const targets = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".vscode") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|svelte|json|md)$/.test(name)) targets.push(p);
  }
}
walk(root);
// also root readme assets later separately

let changed = 0;
for (const file of targets) {
  let text = readFileSync(file, "utf8");
  const before = text;

  // command / view / settings / context keys
  text = text.replaceAll("frostui.", "piAgent.");
  text = text.replaceAll('"frostui"', '"piAgent"');
  text = text.replaceAll("'frostui'", "'piAgent'");
  text = text.replaceAll("frostui@", "piAgent@");
  text = text.replaceAll("onView:frostui", "onView:piAgent");
  text = text.replaceAll("onCommand:frostui", "onCommand:piAgent");
  text = text.replaceAll("getConfiguration(\"frostui\"", "getConfiguration(\"piAgent\"");
  text = text.replaceAll("getConfiguration('frostui'", "getConfiguration('piAgent'");

  // package / UI strings
  text = text.replaceAll("Frost UI — Pi Agent", "Pi Coding Agent");
  text = text.replaceAll("Frost UI - Pi Agent", "Pi Coding Agent");
  text = text.replaceAll("Frost UI:", "Pi Coding Agent:");
  text = text.replaceAll("Frost UI sidebar", "Pi sidebar");
  text = text.replaceAll("Frost UI Session", "Pi session");
  text = text.replaceAll("Frost UI output channel", "Pi output channel");
  text = text.replaceAll("Frost UI credentials", "Pi credentials");
  text = text.replaceAll("Frost UI custom proxy", "Pi custom proxy");
  text = text.replaceAll("Frost UI activates", "Pi Coding Agent activates");
  text = text.replaceAll("Frost UI waits", "Pi Coding Agent waits");
  text = text.replaceAll("Frost UI launches", "Pi Coding Agent launches");
  text = text.replaceAll("Frost UI's private", "Pi Coding Agent private");
  text = text.replaceAll("Inject Frost UI", "Inject Pi Coding Agent");
  text = text.replaceAll("the Frost UI", "the Pi Coding Agent");
  text = text.replaceAll("of the Frost UI", "of Pi Coding Agent");
  text = text.replaceAll("Frost UI and extension host", "Pi Coding Agent and extension host");
  text = text.replaceAll("Open the Frost UI", "Open the Pi");
  text = text.replaceAll("[Frost UI]", "[Pi]");
  text = text.replaceAll("Frost UI Attach", "Pi Attach");
  text = text.replaceAll('"Frost UI"', '"Pi"'); // view names remaining
  text = text.replaceAll("title: \"Frost UI\"", "title: \"Pi\"");
  text = text.replaceAll("name: \"Frost UI\"", "name: \"Pi\"");
  text = text.replaceAll("terminal name Frost UI", "terminal name Pi");
  text = text.replaceAll('"Frost UI"', '"Pi"');

  if (text !== before) {
    writeFileSync(file, text);
    changed++;
  }
}
console.log(`updated ${changed} files under ${root}`);
