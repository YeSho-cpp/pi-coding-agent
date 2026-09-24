import { copyFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

import esbuild from "esbuild";

rmSync("dist", { recursive: true, force: true });

const sourcemap = process.env.FROSTPI_SOURCEMAP === "1";

await Promise.all([
  esbuild.build({
    entryPoints: ["src/extension/activate.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile: "dist/extension/extension.cjs",
    external: ["vscode"],
    sourcemap,
    sourcesContent: sourcemap,
    logLevel: "info",
  }),
  esbuild.build({
    entryPoints: ["pi-extensions/session-tree.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: "dist/pi-extensions/session-tree.js",
    sourcemap,
    sourcesContent: sourcemap,
    logLevel: "info",
  }),
  esbuild.build({
    entryPoints: ["pi-extensions/question-tool.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: "dist/pi-extensions/question-tool.js",
    sourcemap,
    sourcesContent: sourcemap,
    logLevel: "info",
  }),
]);

// Oniguruma is a binary: esbuild bundles its JS loader, the wasm ships next to the bundle and
// the TextMate highlighter loads it from __dirname at runtime.
copyFileSync(
  createRequire(import.meta.url).resolve("vscode-oniguruma/release/onig.wasm"),
  "dist/extension/onig.wasm",
);
