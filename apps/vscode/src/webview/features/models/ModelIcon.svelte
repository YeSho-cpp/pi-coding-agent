<script lang="ts">
  import mimoModelIcon from "../../assets/mimo-model.png";
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
  // Xiaomi MiMo renders its own app icon instead of the LobeHub glyph.
  const usesAppIcon = $derived(entry.title === "XiaomiMiMo");
</script>

{#if usesAppIcon}
  <span
    class="model-brand-avatar model-brand-avatar-app"
    title={entry.title}
    aria-hidden="true"
    style={`width:${size}px;height:${size}px`}
  >
    <img src={mimoModelIcon} alt="" width={size} height={size} />
  </span>
{:else}
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
{/if}

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
  /* The app icon already carries its own rounded-square shape. */
  .model-brand-avatar-app {
    background: transparent;
    border-radius: 22%;
  }
  .model-brand-avatar-app img {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
