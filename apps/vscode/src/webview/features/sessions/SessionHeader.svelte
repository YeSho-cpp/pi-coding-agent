<script lang="ts">
  import { onMount } from "svelte";
  import type { SessionSummaryView, SessionViewModel } from "$shared/model/sessionViewModel";

  import { postToHost } from "../../bridge/vscodeBridge";
  import type { McpServerView } from "$shared/model/mcpModel";
  import { mcpServers } from "../../state/sessionViewStore.svelte";
  import { draftForHost } from "../composer/composerDraftSync";
  import IconButton from "../../primitives/IconButton.svelte";
  import StatusDot from "./StatusDot.svelte";
  import SessionList from "./SessionList.svelte";

  let { sessions, active }: { sessions: SessionSummaryView[]; active: SessionViewModel } = $props();
  let editing = $state(false);
  let titleDraft = $state("");
  let menuOpen = $state(false);
  let launcherOpen = $state(false);
  let launcherVariantsOpen = $state(false);
  let sessionListOpen = $state(false);
  let extensionsMenuOpen = $state(false);
  let mcpOpen = $state(false);
  let mcpExpanded = $state<Record<string, boolean>>({});
  let mcpFilters = $state<Record<string, string>>({});
  let hidden = $state(false);
  let titleInput = $state<HTMLInputElement | null>(null);
  let root = $state<HTMLElement | null>(null);

  const needsAttention = $derived(sessions.some((session) => session.requiresUserInput));
  const backgroundRuns = $derived(sessions.filter((session) => session.id !== active.id && session.status === "running").length);

  $effect(() => {
    if (editing) requestAnimationFrame(() => titleInput?.focus());
  });

  onMount(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (root?.contains(event.target as Node)) return;
      closeMenus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  function closeMenus(): void {
    mcpOpen = false;
    menuOpen = false;
    launcherOpen = false;
    launcherVariantsOpen = false;
    sessionListOpen = false;
    extensionsMenuOpen = false;
  }

  function toggleExtensionsMenu(): void {
    extensionsMenuOpen = !extensionsMenuOpen;
  }

  const mcpView = $derived($mcpServers);

  function loadMcpServers(): void {
    postToHost({ type: "readMcpServers", sessionId: active.id });
  }

  function toggleMcpMenu(): void {
    const opening = !mcpOpen;
    closeMenus();
    mcpOpen = opening;
    // Re-read on every open: the config is a file another process may have changed.
    if (opening) loadMcpServers();
  }

  function toggleMcpServer(name: string): void {
    const expanding = !mcpExpanded[name];
    mcpExpanded[name] = expanding;
    if (expanding) mcpFilters[name] ??= "";
  }

  function mcpToolsFor(server: McpServerView): string[] {
    const names = server.catalog.kind === "uncached" ? [] : server.catalog.toolNames;
    const query = (mcpFilters[server.name] ?? "").trim().toLowerCase();
    return query ? names.filter((name) => name.toLowerCase().includes(query)) : names;
  }

  function toggleActionsMenu(): void {
    const opening = !menuOpen;
    closeMenus();
    menuOpen = opening;
  }

  /** The switch being written, with the state it is trying to reach. */
  let mcpPending: { server: string; enabled: boolean } | null = $state(null);

  $effect(() => {
    // Only the reply that reflects the switch releases it: a read issued before the switch can
    // arrive first and would otherwise unlock the control while the write is still in flight.
    const pending = mcpPending;
    if (!pending || !mcpView) return;
    const observed = mcpView.servers.find((server) => server.name === pending.server)?.enabled;
    if (observed === pending.enabled) mcpPending = null;
  });

  /**
   * Why the host would refuse the switch right now. Shown as a tooltip only — the host enforces
   * the same rules and answers with a visible toast, so disabling the control here would turn a
   * refused switch into a silent one.
   */
  function mcpToggleHint(): string | null {
    if (active.status !== "ready") return "Wait for the Pi session to be ready";
    if (active.isCompacting) return "Wait for the current Pi turn to finish";
    return null;
  }

  function setMcpEnabled(server: McpServerView): void {
    const target = !server.enabled;
    mcpPending = { server: server.name, enabled: target };
    postToHost({
      type: "setMcpServerEnabled",
      sessionId: active.id,
      server: server.name,
      enabled: target,
    });
    // A refused switch comes back as a toast with no list, so the control needs a way out when
    // the host never answers with state that matches.
    setTimeout(() => {
      if (mcpPending?.server === server.name && mcpPending.enabled === target) mcpPending = null;
    }, 4000);
  }

  function beginRename(): void {
    titleDraft = active.title;
    editing = true;
    closeMenus();
  }

  function commitRename(): void {
    const name = titleDraft.trim();
    if (name && name !== active.title) postToHost({ type: "renameSession", sessionId: active.id, name });
    editing = false;
  }

  function createSession(): void {
    closeMenus();
    postToHost({ type: "createSession" });
  }

  function createTemporarySession(): void {
    closeMenus();
    postToHost({ type: "createSession", ephemeral: true });
  }

  function createSessionWithArguments(): void {
    closeMenus();
    postToHost({ type: "createSessionWithArguments" });
  }

  function toggleLauncherVariants(): void {
    launcherVariantsOpen = !launcherVariantsOpen;
  }

  function resumeSession(): void {
    closeMenus();
    postToHost({ type: "resumeSession" });
  }

  function selectSession(sessionId: string): void {
    closeMenus();
    if (sessionId !== active.id) postToHost({ type: "activateSession", sessionId });
  }

  function closeSession(sessionId: string): void {
    closeMenus();
    postToHost({ type: "closeSession", sessionId });
  }

  function openSessionPanel(sessionId?: string): void {
    const targetId = sessionId ?? active.id;
    closeMenus();
    postToHost({ type: "openSessionPanel", sessionId: targetId, draft: draftForHost(targetId) });
  }

  function activeStatusLabel(): string {
    if (active.pendingExtensionUi.length > 0) return "action required";
    if (active.isForking) return "forking session";
    if (active.isNavigatingTree) return active.isSummarizingTree ? "summarizing branch" : "switching branch";
    if (active.isCompacting) return "compacting context";
    if (active.status === "queued") return "waiting to start";
    if (active.historyStatus === "queued") return "waiting for history";
    if (active.historyStatus === "loading") return "loading history";
    if (active.status === "running") {
      if (active.historyStatus === "deferred") return "running · history not loaded";
      if (active.historyStatus === "failed") return "running · history load failed";
      return "running";
    }
    if (active.historyStatus === "deferred") return "history not loaded";
    if (active.historyStatus === "failed") return "history load failed";
    if (active.status === "ready") return "ready";
    return active.status;
  }
</script>

<svelte:window onkeydown={(event) => {
  if (event.key !== "Escape") return;
  closeMenus();
  editing = false;
}} />

<div class="session-header-slot">
{#if hidden}
  <button
    class="session-header-restore"
    class:attention={needsAttention}
    type="button"
    aria-label="Show session bar"
    title={needsAttention ? "Show session bar — a session needs input" : "Show session bar"}
    onclick={() => hidden = false}
  >
    <span class="codicon codicon-comment-discussion" aria-hidden="true"></span>
    {#if needsAttention}<span class="session-header-badge"></span>{:else if backgroundRuns > 0}<span class="session-header-count">{backgroundRuns}</span>{/if}
  </button>
{:else}
  <header class="session-header" bind:this={root}>
    <div class="session-picker-wrap">
      {#if editing}
        <div class="session-heading">
          <StatusDot status={active.status} />
          <input
            class="session-title-input"
            bind:this={titleInput}
            bind:value={titleDraft}
            aria-label="Session name"
            onkeydown={(event) => {
              if (event.key === "Enter") commitRename();
              if (event.key === "Escape") editing = false;
            }}
            onblur={commitRename}
          />
        </div>
      {:else}
        <button
          class="session-heading"
          class:active={sessionListOpen}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={sessionListOpen}
          title={active.cwd}
          onclick={() => { sessionListOpen = !sessionListOpen; menuOpen = false; launcherOpen = false; }}
        >
          <StatusDot status={active.status} />
          <span class="session-title">{active.title}</span>
          {#if active.isEphemeral}<span class="ephemeral-badge">临时</span>{/if}
          <span class="session-inline-status">
            {#if active.workingDirectoryLabel}
              <span class="session-cwd-pill" title={active.cwd}>{active.workingDirectoryLabel}</span>
            {/if}
            <span>· {activeStatusLabel()}</span>
          </span>
          <span class="codicon codicon-chevron-down session-heading-chevron" aria-hidden="true"></span>
        </button>
      {/if}
      {#if sessionListOpen}
        <SessionList
          {sessions}
          activeId={active.id}
          onselect={selectSession}
          onclose={closeSession}
          onexternalize={openSessionPanel}
          oncreate={createSession}
          onresume={resumeSession}
        />
      {/if}
    </div>

    <div class="session-actions">
      <div class="session-menu-wrap">
        <IconButton icon="add" label="New or resume session" active={launcherOpen} onclick={() => { launcherOpen = !launcherOpen; menuOpen = false; sessionListOpen = false; }} />
        {#if launcherOpen}
          <div class="session-menu session-launcher-menu">
            <div class="launcher-create-row">
              <button type="button" class="launcher-create" onclick={createSession}>
                <span class="codicon codicon-add"></span><span><strong>New session</strong><small>Start a clean Pi conversation</small></span>
              </button>
              <button
                type="button"
                class="launcher-expand"
                class:active={launcherVariantsOpen}
                aria-label="More ways to start a session"
                aria-haspopup="true"
                aria-expanded={launcherVariantsOpen}
                onclick={toggleLauncherVariants}
              >
                <span class="codicon" class:codicon-chevron-right={!launcherVariantsOpen} class:codicon-chevron-down={launcherVariantsOpen} aria-hidden="true"></span>
              </button>
            </div>
            {#if launcherVariantsOpen}
              <div class="launcher-variants">
                <button type="button" onclick={createTemporarySession}>
                  <span class="codicon codicon-eye-closed"></span><span><strong>New temporary session</strong><small>Start a conversation that is never saved</small></span>
                </button>
                <button type="button" onclick={createSessionWithArguments}>
                  <span class="codicon codicon-terminal"></span><span><strong>New session with arguments…</strong><small>Pass extra Pi CLI flags for this launch</small></span>
                </button>
              </div>
            {/if}
            <button type="button" onclick={resumeSession}>
              <span class="codicon codicon-history"></span><span><strong>Resume session</strong><small>Open an existing Pi conversation</small></span>
            </button>
          </div>
        {/if}
      </div>
      <div class="session-menu-wrap">
        <IconButton icon="server" label="MCP servers" active={mcpOpen} onclick={toggleMcpMenu} />
        {#if mcpOpen}
          <div class="session-menu mcp-panel">
            <div class="mcp-head">
              <span class="mcp-head-title">MCP servers</span>
              <span class="mcp-head-count">{mcpView ? mcpView.servers.length : "…"}</span>
              <button type="button" class="mcp-refresh" title="Re-read config" onclick={loadMcpServers}>⟳</button>
            </div>
            {#if mcpView?.warning}
              <div class="mcp-warning">{mcpView.warning}</div>
            {/if}
            {#if !mcpView}
              <div class="mcp-empty">Reading…</div>
            {:else if mcpView.servers.length === 0}
              <div class="mcp-empty">
                No MCP servers yet. Pi reads them from <code>~/.pi/agent/mcp.json</code>, and the
                <code>pi-mcp-adapter</code> package is what makes Pi understand that file.
              </div>
            {:else}
              {#each mcpView.servers as server (server.name)}
                <div class="mcp-server" class:mcp-off={!server.enabled}>
                  <div class="mcp-server-row">
                    <button type="button" class="mcp-server-head" onclick={() => toggleMcpServer(server.name)}>
                      <span class="mcp-dot" data-state={server.enabled ? server.catalog.kind : "disabled"}></span>
                      <span class="mcp-server-name">{server.name}</span>
                      <span class="mcp-scope">{server.scope}</span>
                      {#if server.catalog.kind !== "uncached"}
                        <span class="mcp-tools-count">{server.catalog.toolNames.length}</span>
                      {/if}
                      <span
                        class="codicon mcp-chevron"
                        class:codicon-chevron-right={!mcpExpanded[server.name]}
                        class:codicon-chevron-down={mcpExpanded[server.name]}
                        aria-hidden="true"
                      ></span>
                    </button>
                    <button
                      type="button"
                      class="mcp-switch"
                      role="switch"
                      aria-checked={server.enabled}
                      aria-label={`${server.enabled ? "Disable" : "Enable"} ${server.name} for this workspace`}
                      title={mcpToggleHint() ?? (server.enabled ? "Disable for this workspace" : "Enable for this workspace")}
                      disabled={mcpPending?.server === server.name}
                      onclick={() => setMcpEnabled(server)}
                    ></button>
                  </div>
                  {#if mcpExpanded[server.name]}
                    <div class="mcp-detail">
                      {#if server.command}<code class="mcp-command" title={server.command}>{server.command}</code>{/if}
                      {#if server.url}<code class="mcp-command" title={server.url}>{server.url}</code>{/if}
                      {#if server.disabledByProject}
                        <div class="mcp-note">Disabled for this workspace by <code>.pi/mcp.json</code>.</div>
                      {/if}
                      {#if server.catalog.kind === "uncached"}
                        <div class="mcp-note">No catalog yet — Pi caches it the first time the server runs.</div>
                      {:else}
                        {#if server.catalog.kind === "expired"}
                          <div class="mcp-note">Cached catalog is over a week old and refreshes on next use.</div>
                        {/if}
                        <input
                          class="mcp-search"
                          placeholder={`Search ${server.catalog.toolNames.length} tools…`}
                          bind:value={mcpFilters[server.name]}
                        />
                        <div class="mcp-chip-row">
                          {#each mcpToolsFor(server) as tool (tool)}
                            <span class="mcp-chip">{tool}</span>
                          {/each}
                          {#if mcpToolsFor(server).length === 0}
                            <span class="mcp-note">No tool matches.</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
            <div class="mcp-foot">
              <div>Switches write to <code>.pi/mcp.json</code> and apply after the Pi session restarts.</div>
              <div>Catalog state only — live connection status lives in Pi's own TUI.</div>
            </div>
          </div>
        {/if}
        <IconButton icon="ellipsis" label="Session actions" active={menuOpen} onclick={toggleActionsMenu} />
        {#if menuOpen}
          <div class="session-menu">
            <button type="button" onclick={() => openSessionPanel()}><span class="codicon codicon-layout"></span> Open in editor tab</button>
            <button type="button" onclick={beginRename}><span class="codicon codicon-edit"></span> Rename</button>
            {#if active.historyStatus === "deferred" || active.historyStatus === "failed"}
              <button type="button" onclick={() => { closeMenus(); postToHost({ type: "loadHistory", sessionId: active.id }); }}><span class="codicon codicon-history"></span> Load conversation history</button>
            {/if}
            <button type="button" disabled={active.isEphemeral} title={active.isEphemeral ? "Temporary sessions cannot be restarted" : undefined} onclick={() => { closeMenus(); postToHost({ type: "restartSession", sessionId: active.id }); }}><span class="codicon codicon-debug-restart"></span> Restart session</button>
            {#if active.sessionFile}
              <button
                type="button"
                title={`Copy session file: ${active.sessionFile}`}
                onclick={() => { closeMenus(); postToHost({ type: "copyText", text: active.sessionFile! }); }}
              >
                <span class="codicon codicon-copy"></span>
                <span><strong>Session file</strong><small class="session-file-path">{active.sessionFile}</small></span>
              </button>
            {/if}
            <div class="session-submenu-wrap">
              <button
                type="button"
                class="session-submenu-trigger"
                class:active={extensionsMenuOpen}
                aria-haspopup="true"
                aria-expanded={extensionsMenuOpen}
                onclick={toggleExtensionsMenu}
              >
                <span class="codicon codicon-extensions"></span>
                <span><strong>Pi extensions (session)</strong></span>
                <span
                  class="codicon session-submenu-chevron"
                  class:codicon-chevron-right={!extensionsMenuOpen}
                  class:codicon-chevron-down={extensionsMenuOpen}
                  aria-hidden="true"
                ></span>
              </button>
              {#if extensionsMenuOpen}
                <div class="session-menu session-submenu">
                  <button type="button" onclick={() => { closeMenus(); postToHost({ type: "checkPiIntegration", sessionId: active.id }); }}>
                    <span class="codicon codicon-list-tree"></span>
                    <span><strong>Session tree adapter</strong><small>{active.sessionTreeAvailable ? "Connected" : "Unavailable"}</small></span>
                  </button>
                  <button type="button" disabled>
                    <span class="codicon codicon-question"></span>
                    <span>
                      <strong>Question tool</strong>
                      <small>
                        {active.questionTool.restartRequired
                          ? active.isEphemeral
                            ? "Restart unavailable · temporary session"
                            : `${active.questionTool.configuredEnabled ? "Enable" : "Disable"} after restart`
                          : active.questionTool.appliedEnabled ? "Enabled for this process" : "Disabled"}
                      </small>
                    </span>
                  </button>
                </div>
              {/if}
            </div>
            <div class="menu-separator"></div>
            <button class="danger" type="button" onclick={() => closeSession(active.id)}><span class="codicon codicon-close"></span> Close session</button>
          </div>
        {/if}
      </div>
      <IconButton icon="chevron-up" label="Hide session bar" onclick={() => { closeMenus(); hidden = true; }} />
    </div>
  </header>
{/if}
</div>

<style>
  .session-file-path { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-menu button:disabled { opacity: .5; cursor: default; }
  .ephemeral-badge { flex: 0 0 auto; padding: 1px 4px; border: 1px solid var(--frost-border); border-radius: 4px; color: var(--frost-muted); font-size: 9px; line-height: 1.2; }
  .launcher-create-row { display: flex; align-items: stretch; }
  .launcher-create-row > button { width: auto; }
  .launcher-create { flex: 1 1 auto; }
  .launcher-expand { flex: 0 0 auto; padding: 7px; opacity: 0.7; }
  .launcher-expand.active { background: var(--frost-hover); opacity: 1; }
  .launcher-variants { display: flex; flex-direction: column; margin: 2px 0 2px 29px; padding-left: 3px; border-left: 2px solid var(--frost-border); }
</style>
