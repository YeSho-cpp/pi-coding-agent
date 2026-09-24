/**
 * Maps TextMate scopes onto the highlight.js class names the markdown stylesheet already colors,
 * so a TextMate-tokenized block reuses the existing `--md-syn-*` palette untouched.
 *
 * Classes are chosen by *colour* semantics, not by name similarity — our stylesheet is a hljs
 * theme where `.hljs-type` is painted with the keyword blue and `.hljs-meta` with the comment
 * colour (italic). A TextMate type scope therefore maps to `hljs-built_in` (the type colour) and
 * generic `meta` / `entity.name` scopes map to nothing, so they fall back to the block
 * foreground instead of picking up a neighbouring rule's colour.
 *
 * Specificity: the deepest scope that any rule matches decides first (so a function body's
 * `punctuation.…` beats its wrapping `meta.function`), then the longest matching prefix wins
 * (so `variable.other.member` beats `variable`).
 */

/** [scope prefix, hljs class or null when the scope should stay uncoloured]. */
const RULES: ReadonlyArray<readonly [prefix: string, className: string | null]> = [
  ["comment", "hljs-comment"],
  ["string", "hljs-string"],
  ["regexp", "hljs-regexp"],
  ["constant.numeric", "hljs-number"],
  ["constant.language", "hljs-literal"],
  ["entity.name.function", "hljs-function"],
  ["meta.function-call", "hljs-function"],
  ["support.function.builtin", "hljs-built_in"],
  ["support.function", "hljs-function"],
  ["variable.function", "hljs-function"],
  ["entity.other.attribute-name", "hljs-attr"],
  ["entity.name.tag", "hljs-tag"],
  ["keyword.operator", "hljs-operator"],
  ["punctuation", "hljs-punctuation"],
  ["entity.name.type", "hljs-built_in"],
  ["storage.type", "hljs-built_in"],
  ["support.class", "hljs-built_in"],
  ["entity.name.class", "hljs-built_in"],
  ["support.type", "hljs-built_in"],
  ["support.constant", "hljs-literal"],
  ["storage", "hljs-keyword"],
  ["keyword", "hljs-keyword"],
  ["variable.parameter", "hljs-params"],
  ["variable.other.member", "hljs-property"],
  ["variable.other", "hljs-variable"],
  ["variable", "hljs-variable"],
  ["entity.name.section", "hljs-section"],
  ["meta.function", "hljs-function"],
  ["meta", null],
  ["entity.name", null],
  ["support", null],
  ["invalid", "hljs-deletion"],
  ["illegal", "hljs-deletion"],
];

function matches(scope: string, prefix: string): boolean {
  return scope === prefix || scope.startsWith(`${prefix}.`);
}

/** The hljs class to paint one token with, or null to leave it on the block foreground. */
export function classForScopes(scopes: readonly string[]): string | null {
  if (scopes.length === 0) return null;

  // Scopes are ordered root → leaf; the deepest one that any rule recognises wins.
  let target = -1;
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const candidate = scopes[index];
    if (candidate !== undefined && RULES.some(([prefix]) => matches(candidate, prefix))) {
      target = index;
      break;
    }
  }
  if (target < 0) return null;

  const scope = scopes[target];
  if (scope === undefined) return null;
  let best: { length: number; className: string | null } | null = null;
  for (const [prefix, className] of RULES) {
    if (!matches(scope, prefix)) continue;
    if (!best || prefix.length > best.length) best = { length: prefix.length, className };
  }
  return best?.className ?? null;
}
