<script lang="ts">
  import hljs from "highlight.js/lib/common";

  import { requestHighlightedCode } from "./markdown/highlightClient";

  let { code, lang }: { code: string; lang: string | null } = $props();

  // Tokenizing very large dumps would stall the webview for no reader benefit.
  const MAX_HIGHLIGHT_CHARS = 60_000;
  const UPGRADE_DELAY_MS = 150;

  const eligible = $derived(!!lang && code.length > 0 && code.length <= MAX_HIGHLIGHT_CHARS);
  const instant = $derived(
    eligible && lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : null,
  );
  let upgraded = $state<{ code: string; lang: string; html: string } | null>(null);
  const html = $derived(upgraded && upgraded.code === code && upgraded.lang === lang ? upgraded.html : instant);

  // The host tokenizes with the user's own grammars; a streaming output is debounced so
  // each chunk does not cost a round trip.
  $effect(() => {
    if (!eligible || !lang) return;
    const sourceCode = code;
    const sourceLang = lang;
    let live = true;
    const timer = setTimeout(() => {
      void requestHighlightedCode(sourceLang, sourceCode).then((result) => {
        if (live && result) upgraded = { code: sourceCode, lang: sourceLang, html: result };
      });
    }, UPGRADE_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  });
</script>

{#if html !== null}<code>{@html html}</code>{:else}<code>{code}</code>{/if}
