<script lang="ts">
  import { postToHost } from "../../bridge/vscodeBridge";

  let {
    command,
    output,
  }: {
    command: string;
    output: string;
  } = $props();

  let copiedCmd = $state(false);
  let copiedOut = $state(false);

  const rawCommand = $derived(command.replace(/^!!?/, ""));
  const commandTitle = $derived(command.startsWith("!!") ? "!!" : command.startsWith("!") ? "!" : "$");
  const shortTitle = $derived(rawCommand.split(/\s+/).slice(0, 3).join(" ") || rawCommand);

  function copyCommand(): void {
    postToHost({ type: "copyText", text: rawCommand });
    copiedCmd = true;
    window.setTimeout(() => { copiedCmd = false; }, 1200);
  }

  function copyOutput(): void {
    postToHost({ type: "copyText", text: output });
    copiedOut = true;
    window.setTimeout(() => { copiedOut = false; }, 1200);
  }

  function openInTerminal(): void {
    postToHost({ type: "openShellInTerminal", command: rawCommand });
  }

  function copyAll(): void {
    postToHost({ type: "copyText", text: `${rawCommand}\n${output}` });
  }
</script>

<section class="shell-card" aria-label={`Shell command ${command}`}>
  <header class="shell-card-header">
    <span class="shell-card-dollar" aria-hidden="true">$</span>
    <span class="shell-card-command" title={rawCommand}>{shortTitle}</span>
    <div class="shell-card-actions">
      <button type="button" class="shell-action icon-only" title="Open in terminal (>)" aria-label="Open in terminal" onclick={openInTerminal}>
        <span class="codicon codicon-terminal-cmd" aria-hidden="true"></span>
      </button>
      <button type="button" class="shell-action icon-only" title="复制命令" aria-label="Copy command" onclick={copyCommand}>
        <span class="codicon codicon-copy" aria-hidden="true"></span>
      </button>
      <button type="button" class="shell-action icon-only" title="Copy output" aria-label="Copy output" onclick={copyOutput}>
        <span class="codicon codicon-clippy" aria-hidden="true"></span>
      </button>
      <button type="button" class="shell-action icon-only" title="Copy command + output" aria-label="Copy all" onclick={copyAll}>
        <span class="codicon codicon-files" aria-hidden="true"></span>
      </button>
    </div>
  </header>
  <pre class="shell-card-body" tabindex="0"><code>{output || "(no output)"}</code></pre>
</section>

<style>
  .shell-card {
    margin: 6px 0 12px;
    border: 1px solid #2a2928;
    border-radius: 10px;
    background: #0e0d0c;
    overflow: hidden;
  }
  .shell-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 4px 6px 4px 12px;
    border-bottom: 1px solid #242322;
    background: #161514;
  }
  .shell-card-dollar {
    color: #9ece6a;
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 13px;
  }
  .shell-card-command {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--frost-text);
    user-select: text;
  }
  .shell-card-actions {
    flex: none;
    display: flex;
    gap: 2px;
  }
  .shell-action.icon-only {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--frost-muted);
    cursor: pointer;
  }
  .shell-action.icon-only:hover {
    color: var(--frost-text);
    background: #2a2928;
  }
  .shell-card-body {
    margin: 0;
    max-height: 360px;
    overflow: auto;
    padding: 10px 14px 12px;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.5;
    color: #9ece6a;
    background: #0e0d0c;
    white-space: pre-wrap;
    user-select: text;
    -webkit-user-select: text;
  }
  .shell-card-body :global(code) {
    font-family: inherit;
    color: inherit;
  }
</style>
