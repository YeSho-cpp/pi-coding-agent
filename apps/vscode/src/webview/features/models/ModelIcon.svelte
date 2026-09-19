<script lang="ts">
  import { getModelIcon } from "./modelIcons";

  let {
    name,
    provider,
    size = 22,
  }: {
    name?: string | null;
    provider?: string | null;
    size?: number;
  } = $props();

  const entry = $derived(getModelIcon(name, provider));
  const iconSize = $derived(Math.round(size * 0.62));
</script>

<span
  class="model-brand-avatar"
  title={entry.title}
  aria-hidden="true"
  style={`width:${size}px;height:${size}px;background:${entry.color}`}
>
  <svg
    viewBox="0 0 24 24"
    width={iconSize}
    height={iconSize}
    fill="#ffffff"
    fill-rule="evenodd"
  >
    {#each entry.paths as d, i (i)}
      <path {d}></path>
    {/each}
  </svg>
</span>

<style>
  .model-brand-avatar {
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    flex: none;
    overflow: hidden;
    vertical-align: middle;
  }
  .model-brand-avatar svg {
    display: block;
  }
</style>
