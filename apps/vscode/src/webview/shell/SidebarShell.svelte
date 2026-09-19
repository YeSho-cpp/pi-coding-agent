<script lang="ts">
  import type { CatalogSessionSummaryView, SessionSummaryView, SessionViewModel } from "$shared/model/sessionViewModel";

  import OnboardingView from "../features/onboarding/OnboardingView.svelte";
  import ExternalizedSessionView from "../features/sessions/ExternalizedSessionView.svelte";
  import SessionHeader from "../features/sessions/SessionHeader.svelte";
  import SessionInteraction from "./SessionInteraction.svelte";

  let {
    sessions,
    session,
    externalized,
    draftAuthority,
    catalogSessions = [],
  }: {
    sessions: SessionSummaryView[];
    session: SessionViewModel;
    externalized: boolean;
    draftAuthority: "webview" | "host";
    catalogSessions?: CatalogSessionSummaryView[];
  } = $props();
</script>

<div class="app-shell">
  <SessionHeader {sessions} active={session} />
  {#if externalized}
    <ExternalizedSessionView {session} />
  {:else if session.status === "failed"}
    <OnboardingView {session} {sessions} {catalogSessions} />
  {:else}
    <SessionInteraction {session} surfaceKind="sidebar" {draftAuthority} />
  {/if}
</div>
