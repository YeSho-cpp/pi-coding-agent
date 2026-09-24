import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { INITIAL, Registry } from "@shikijs/vscode-textmate";
import { createOnigScanner, createOnigString, loadWASM } from "vscode-oniguruma";

import { classForScopes } from "./scopeClassMap.js";

/** TextMate tokenization for chat fences. Grammars are NOT shipped: the caller passes roots —
 * in production the user's own VS Code install — so tokens match the editor beside it. Returns
 * hljs-classed spans (the stylesheet's existing palette) or null, in which case the caller keeps
 * the synchronous highlight.js first pass as the fallback. */

export interface TextmateHighlighter {
  highlight(lang: string, code: string): string | null;
}

interface GrammarEntry {
  scopeName: string;
  path: string;
}

interface GrammarIndex {
  byLanguage: Map<string, GrammarEntry>;
  byScope: Map<string, string>;
}

const MAX_CODE_CHARACTERS = 500_000;
const MAX_CACHE_ENTRIES = 96;

/** Grammar/manifest JSON tolerates comments and trailing commas. */
export function parseLooseJson(text: string): unknown {
  return JSON.parse(stripJsonc(text));
}

function stripJsonc(source: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && source.charAt(index + 1) === "/") {
      while (index < source.length && source.charAt(index) !== "\n") index += 1;
      continue;
    }
    if (char === "/" && source.charAt(index + 1) === "*") {
      index += 2;
      while (index < source.length && !(source.charAt(index) === "*" && source.charAt(index + 1) === "/")) index += 1;
      index += 1;
      continue;
    }
    if (char === ",") {
      let peek = index + 1;
      while (peek < source.length) {
        if (/\s/.test(source.charAt(peek))) {
          peek += 1;
          continue;
        }
        if (source.charAt(peek) === "/" && source.charAt(peek + 1) === "/") {
          while (peek < source.length && source.charAt(peek) !== "\n") peek += 1;
          continue;
        }
        break;
      }
      const nextChar = source.charAt(peek); if (peek < source.length && (nextChar === "]" || nextChar === "}")) continue;
      out += char;
      continue;
    }
    out += char;
  }
  return out;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * VS Code's own C/C++ grammar leaves expression identifiers (`sock->asyncFlag`) unscoped — what
 * makes them blue in Copilot Chat is semantic highlighting no extension can run on chat text.
 * Words inside *unscoped* runs are therefore coloured as variables, which lands on the same
 * `--md-syn-variable` blue. Scoped runs (keywords, strings, comments, operators) are never
 * touched here, so nothing already classified gets re-tagged.
 */
export function colorizeUnscopedIdentifiers(text: string): string {
  const pattern = /[A-Za-z_][A-Za-z0-9_]*/g;
  let out = "";
  let last = 0;
  let match = pattern.exec(text);
  while (match) {
    out += escapeText(text.slice(last, match.index));
    out += '<span class="hljs-variable">' + escapeText(match[0]) + "</span>";
    last = match.index + match[0].length;
    match = pattern.exec(text);
  }
  out += escapeText(text.slice(last));
  return out;
}

function buildIndex(roots: readonly string[]): GrammarIndex {
  const byLanguage = new Map<string, GrammarEntry>();
  const byScope = new Map<string, string>();
  const languages = new Map<string, string>();

  for (const root of roots) {
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const name of entries) {
      const extensionRoot = join(root, name);
      let manifest: unknown;
      try {
        manifest = parseLooseJson(readFileSync(join(extensionRoot, "package.json"), "utf8"));
      } catch {
        continue;
      }
      const pkg = manifest as {
        contributes?: {
          grammars?: Array<{ language?: string; scopeName?: string; path?: string }>;
          languages?: Array<{ id?: string; aliases?: string[] }>;
        };
      };
      for (const language of pkg.contributes?.languages ?? []) {
        if (!language.id) continue;
        languages.set(language.id.toLowerCase(), language.id);
        for (const alias of language.aliases ?? []) languages.set(alias.toLowerCase(), language.id);
      }
      for (const grammar of pkg.contributes?.grammars ?? []) {
        if (!grammar.scopeName || !grammar.path) continue;
        const absolutePath = resolve(extensionRoot, grammar.path);
        if (!byScope.has(grammar.scopeName)) byScope.set(grammar.scopeName, absolutePath);
        if (grammar.language && !byLanguage.has(grammar.language)) {
          byLanguage.set(grammar.language, { scopeName: grammar.scopeName, path: absolutePath });
        }
      }
    }
  }

  // Aliases resolve after every manifest is read: `bash` lives on shellscript's language entry.
  const resolved = new Map<string, GrammarEntry>();
  for (const [alias, languageId] of languages) {
    const entry = byLanguage.get(languageId);
    if (entry) resolved.set(alias, entry);
  }
  for (const [languageId, entry] of byLanguage) {
    if (!resolved.has(languageId.toLowerCase())) resolved.set(languageId.toLowerCase(), entry);
  }
  return { byLanguage: resolved, byScope };
}

export async function createTextmateHighlighter(options: {
  wasmPath: string;
  roots: readonly string[];
  fenceToLanguage?: Readonly<Record<string, string>>;
}): Promise<TextmateHighlighter> {
  await loadWASM(readFileSync(options.wasmPath));
  const index = buildIndex(options.roots);
  const fenceOverrides = options.fenceToLanguage ?? {};

  const registry = new Registry({
    // The shiki fork of vscode-textmate is synchronous: onigLib and loadGrammar take plain values.
    onigLib: { createOnigScanner, createOnigString },
    loadGrammar: (scopeName: string) => {
      const path = index.byScope.get(scopeName);
      if (!path) return null;
      try {
        return parseLooseJson(readFileSync(path, "utf8")) as never;
      } catch {
        return null;
      }
    },
  });

  const cache = new Map<string, string>();

  function tokenize(code: string, entry: GrammarEntry): string | null {
    // Registry caches compiled grammars internally; no second cache needed here.
    const grammar = registry.loadGrammar(entry.scopeName);
    if (!grammar) return null;
    const lines = code.split("\n");
    let ruleStack = INITIAL;
    const html: string[] = [];
    for (const line of lines) {
      const result = grammar.tokenizeLine(line, ruleStack);
      ruleStack = result.ruleStack;
      for (const token of result.tokens) {
        const text = line.slice(token.startIndex, token.endIndex);
        if (!text) continue;
        const className = classForScopes(token.scopes);
        html.push(className ? `<span class="${className}">${escapeText(text)}</span>` : colorizeUnscopedIdentifiers(text));
      }
      html.push("\n");
    }
    if (html.length > 0 && html[html.length - 1] === "\n") html.pop();
    return html.join("");
  }

  return {
    highlight(lang: string, code: string): string | null {
      if (!lang || !code || code.length > MAX_CODE_CHARACTERS) return null;
      const normalized = lang.toLowerCase();
      const cacheKey = normalized + " " + code;
      const cached = cache.get(cacheKey);
      if (cached !== undefined) return cached;

      let result: string | null = null;
      try {
        const entry = index.byLanguage.get(fenceOverrides[normalized] ?? normalized);
        if (entry) result = tokenize(code, entry);
      } catch {
        result = null;
      }
      if (result !== null) {
        cache.delete(cacheKey);
        cache.set(cacheKey, result);
        while (cache.size > MAX_CACHE_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) break;
          cache.delete(oldest);
        }
      }
      return result;
    },
  };
}
