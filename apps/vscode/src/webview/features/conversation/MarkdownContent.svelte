<script lang="ts" module>
  import type { MarkdownSegment } from "./markdown/parseMessageBlocks";

  function segmentKey(segment: MarkdownSegment, index: number): string {
    // Markdown keeps one mount while its text streams in (a content key would rebuild the whole
    // block on every token); fenced previews are keyed by content so completed ones survive later updates.
    if (segment.type === "markdown") return `${index}:markdown`;
    return `${index}:${segment.type}:${segment.text.length}:${simpleHash(segment.text)}`;
  }

  function simpleHash(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
</script>

<script lang="ts">
  import MarkdownHtml from "./markdown/MarkdownHtml.svelte";
  import MermaidBlock from "./markdown/MermaidBlock.svelte";
  import PreviewFence from "./markdown/PreviewFence.svelte";
  import { parseMessageBlocks } from "./markdown/parseMessageBlocks";

  let { content, streaming = false }: { content: string; streaming?: boolean } = $props();

  const segments = $derived(parseMessageBlocks(content));
</script>

<div class="message-content">
  {#each segments as segment, index (segmentKey(segment, index))}
    {#if segment.type === "markdown"}
      <MarkdownHtml content={segment.text} {streaming} />
    {:else if segment.type === "mermaid"}
      <MermaidBlock source={segment.text} />
    {:else}
      <PreviewFence language={segment.type} source={segment.text} />
    {/if}
  {/each}
</div>
