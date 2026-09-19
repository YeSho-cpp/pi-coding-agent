<script lang="ts">
  import { pruneAnnotationReviews } from "./features/annotation-review/annotationReviewStore.svelte";
  import OnboardingView from "./features/onboarding/OnboardingView.svelte";
  import PanelShell from "./shell/PanelShell.svelte";
  import SidebarShell from "./shell/SidebarShell.svelte";
  import {
    pendingSessionOpen,
    presentationStore,
    toastStore,
  } from "./state/sessionViewStore.svelte";

  $effect(() => {
    const presentation = $presentationStore;
    const sessionIds = presentation.surface.kind === "panel"
      ? presentation.displayedSession ? [presentation.displayedSession.id] : []
      : [
          ...presentation.sessions.map(({ id }) => id),
          ...(presentation.displayedSession ? [presentation.displayedSession.id] : []),
        ];
    pruneAnnotationReviews(sessionIds);
  });

  $effect(() => {
    if ($presentationStore.displayedSession) pendingSessionOpen.set(false);
  });
</script>

<main class="frostui-root">
  {#if $presentationStore.surface.kind === "panel"}
    {#if $presentationStore.displayedSession}
      <PanelShell session={$presentationStore.displayedSession} />
    {:else}
      <section class="removed-panel-session" role="status">This Pi session is no longer available.</section>
    {/if}
  {:else if !$presentationStore.workspacePath}
    <OnboardingView noWorkspace />
  {:else if !$presentationStore.displayedSession}
    {#if $pendingSessionOpen}
      <section class="session-opening" role="status">
        <span class="codicon codicon-loading codicon-modifier-spin" aria-hidden="true"></span>
        <p>正在打开 Pi 会话…</p>
      </section>
    {:else}
      <OnboardingView
        sessions={$presentationStore.sessions}
        catalogSessions={$presentationStore.catalogSessions ?? []}
      />
    {/if}
  {:else}
    <SidebarShell
      sessions={$presentationStore.sessions}
      session={$presentationStore.displayedSession}
      externalized={$presentationStore.sidebarSessionExternalized}
      draftAuthority={$presentationStore.composerDraftAuthority}
      catalogSessions={$presentationStore.catalogSessions ?? []}
    />
  {/if}

  <div class="toast-stack" aria-live="polite">
    {#each $toastStore as toast (toast.id)}
      <div class={`toast toast-${toast.level}`}>
        <span class={`codicon codicon-${toast.level === "error" ? "error" : toast.level === "warning" ? "warning" : "info"}`}></span>
        <span>{toast.message}</span>
      </div>
    {/each}
  </div>
</main>

<style>
.removed-panel-session { margin: auto; color: var(--frost-muted); }
.session-opening {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--frost-muted);
  font-size: 12px;
}
.session-opening p { margin: 0; }
.toast-stack {
  position: fixed;
  z-index: 150;
  right: 10px;
  bottom: 10px;
  width: min(360px, calc(100vw - 20px));
  display: grid;
  gap: 6px;
  pointer-events: none;
}
.toast {
  display: grid;
  grid-template-columns: 17px minmax(0,1fr);
  gap: 8px;
  padding: 9px 10px;
  background: var(--frost-surface-raised);
  border: 1px solid var(--frost-border);
  border-radius: 7px;
  box-shadow: var(--frost-shadow);
  animation: toast-in var(--motion-normal) ease-out;
  font-size: 11px;
}
.toast-error :global(.codicon) { color: var(--frost-error); }
.toast-warning :global(.codicon) { color: var(--frost-warning); }
.toast-info :global(.codicon) { color: var(--frost-link); }
</style>
