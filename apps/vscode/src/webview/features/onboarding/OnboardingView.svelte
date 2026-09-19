<script lang="ts">
  import type { SessionViewModel } from "$shared/model/sessionViewModel";
  import { postToHost } from "../../bridge/vscodeBridge";

  let { session = null, noWorkspace = false }: { session?: SessionViewModel | null; noWorkspace?: boolean } = $props();
</script>

<div class="onboarding-view frostui-empty">
  <div class="frostui-watermark" aria-hidden="true">
    <svg viewBox="0 0 80 80" width="132" height="132">
      <rect x="6" y="6" width="68" height="68" rx="18" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".55"/>
      <text x="40" y="52" text-anchor="middle" font-size="38" font-family="Georgia, serif" fill="currentColor">π</text>
    </svg>
  </div>
  <div class="frostui-brand">Pi Coding Agent</div>

  {#if noWorkspace}
    <h1>Open a workspace</h1>
    <p>Pi Coding Agent runs Pi in the workspace extension host so files, tools, and shell match the project you are editing.</p>
    <div class="onboarding-actions">
      <button class="primary tint-primary" type="button" onclick={() => postToHost({ type: "openFolder" })}>
        <span class="codicon codicon-folder-opened"></span> Open folder
      </button>
    </div>
  {:else if session?.status === "failed"}
    <h1>Pi could not start</h1>
    <p class="onboarding-error">{session.error ?? "Unknown startup error"}</p>
    <div class="onboarding-actions">
      {#if !session.isEphemeral}
        <button class="primary tint-primary" type="button" onclick={() => postToHost({ type: "retryStart", sessionId: session.id })}>
          <span class="codicon codicon-refresh"></span> Retry
        </button>
      {/if}
      <button class="tint-neutral" type="button" onclick={() => postToHost({ type: "configureExecutable" })}>
        <span class="codicon codicon-terminal"></span> Configure Pi
      </button>
      <button class="tint-neutral" type="button" onclick={() => postToHost({ type: "openSettings" })}>
        <span class="codicon codicon-settings-gear"></span> Settings
      </button>
    </div>
    <p class="onboarding-note">Pi Coding Agent uses your existing Pi providers, models, skills, and <code>~/.pi/agent</code> sessions.</p>
  {:else}
    <h1>Start a Pi session</h1>
    <p>Pick up where you left off, or begin a new conversation in this workspace.</p>
    <div class="onboarding-actions">
      <button class="primary tint-primary" type="button" onclick={() => postToHost({ type: "createSession" })}>
        <span class="codicon codicon-add"></span> New session
      </button>
      <button class="tint-neutral" type="button" onclick={() => postToHost({ type: "resumeSession" })}>
        <span class="codicon codicon-history"></span> Resume session
      </button>
    </div>
    <p class="onboarding-note">Sessions share the same store as terminal <code>pi</code>.</p>
  {/if}
</div>

<style>
  .frostui-empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 28px 24px;
    text-align: center;
  }
  .frostui-watermark {
    color: var(--frost-accent);
    opacity: 0.16;
    line-height: 0;
    margin-bottom: 4px;
  }
  .frostui-brand {
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--frost-accent) 75%, var(--frost-muted));
    font-weight: 600;
    margin-bottom: 2px;
  }
  .onboarding-view :global(h1) {
    margin: 10px 0 6px;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .onboarding-view :global(p) {
    max-width: 420px;
    margin: 0 0 16px;
    color: var(--frost-muted);
    font-size: 12px;
    line-height: 1.55;
  }
  .onboarding-view :global(code) {
    font-family: var(--font-mono);
    font-size: 0.92em;
    color: var(--frost-text);
  }
  .onboarding-error {
    max-height: 160px;
    overflow: auto;
    padding: 10px 12px !important;
    background: color-mix(in srgb, var(--frost-error) 8%, var(--frost-surface));
    border: 1px solid color-mix(in srgb, var(--frost-error) 30%, var(--frost-border));
    border-radius: 10px;
    color: var(--frost-error) !important;
    text-align: left;
    white-space: pre-wrap;
    font-family: var(--font-mono);
    font-size: 11px !important;
  }
  .onboarding-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .onboarding-actions :global(button) {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 13px;
    border-radius: 10px;
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }
  .onboarding-actions :global(.tint-primary) {
    background: color-mix(in srgb, var(--frost-accent) 16%, transparent);
    border-color: color-mix(in srgb, var(--frost-accent) 28%, transparent);
    color: var(--frost-accent);
  }
  .onboarding-actions :global(.tint-primary:hover) {
    background: color-mix(in srgb, var(--frost-accent) 24%, transparent);
  }
  .onboarding-actions :global(.tint-neutral) {
    background: color-mix(in srgb, var(--frost-secondary-bg) 80%, transparent);
    border-color: var(--frost-border-soft);
    color: var(--frost-text);
  }
  .onboarding-actions :global(.tint-neutral:hover) {
    background: var(--frost-secondary-hover);
  }
  .onboarding-actions :global(.primary) {
    /* keep legacy class working */
  }
  .onboarding-note { opacity: 0.75; margin-bottom: 0 !important; font-size: 11px !important; }
</style>
