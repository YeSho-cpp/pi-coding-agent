<script lang="ts">
  import type { RpcModel } from "@frostime/pi-rpc";

  import ModelIcon from "./ModelIcon.svelte";

  let {
    provider,
    models,
    selected,
    open,
    toggle,
    onselect,
  }: {
    provider: string;
    models: RpcModel[];
    selected: RpcModel | null;
    open: boolean;
    toggle: () => void;
    onselect: (model: RpcModel) => void;
  } = $props();

  const first = $derived(models[0]);
</script>

<section class="provider-group">
  <button class="provider-trigger" type="button" aria-expanded={open} onclick={toggle}>
    <span class={`codicon codicon-chevron-${open ? "down" : "right"}`}></span>
    <ModelIcon name={first?.name ?? first?.id} provider={provider} size={22} />
    <span class="provider-name">{provider}</span>
    <span class="provider-count">{models.length}</span>
  </button>
  {#if open}
    <div class="provider-models">
      {#each models as model (`${model.provider}/${model.id}`)}
        <button
          class:selected={selected?.provider === model.provider && selected?.id === model.id}
          class="model-option"
          type="button"
          title={`${model.provider}/${model.id}`}
          aria-label={`${model.name ?? model.id}, ${model.provider}/${model.id}`}
          onclick={() => onselect(model)}
        >
          <ModelIcon name={model.name ?? model.id} provider={model.provider} size={22} />
          <span class="model-option-main">
            <span class="model-option-name">{model.name ?? model.id}</span>
            <span class="model-option-meta">{model.provider}</span>
          </span>
          <span class="model-capabilities">
            {#if model.reasoning}<span title="Reasoning model" class="codicon codicon-lightbulb"></span>{/if}
            {#if model.supportsImages === true || (Array.isArray(model.input) && model.input.includes("image"))}
              <span title="Supports images" class="codicon codicon-file-media"></span>
            {/if}
            {#if selected?.provider === model.provider && selected?.id === model.id}<span class="codicon codicon-check"></span>{/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .provider-trigger {
    grid-template-columns: 14px 22px minmax(0, 1fr) auto !important;
  }
  .model-option {
    grid-template-columns: 22px minmax(0, 1fr) auto !important;
    padding-left: 8px !important;
    gap: 8px !important;
  }
  .model-option-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .model-option-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .model-option-meta {
    color: var(--frost-faint);
    font-size: 9px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
