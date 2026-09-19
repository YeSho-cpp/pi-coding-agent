<p align="center">
  <img src="apps/vscode/assets/icon.png" alt="Pi Coding Agent" width="128">
</p>

<h1 align="center">Pi Coding Agent</h1>

<p align="center">
  <strong>Visual VS Code UI for <a href="https://pi.dev">Pi</a> — your CLI, config, models, and sessions.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=yesho.pi-coding-agent-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/yesho.pi-coding-agent-vscode?style=flat-square&label=VS%20Marketplace&logo=visual-studio-code" alt="Marketplace"></a>
  <img src="https://img.shields.io/github/license/YeSho-cpp/pi-coding-agent?style=flat-square" alt="License">
</p>

**Pi Coding Agent UI** is a VS Code extension that drives [Mario Zechner’s](https://github.com/badlogic) open-source [Pi coding agent](https://github.com/earendil-works/pi) from a native sidebar: conversation, tool cards, model picker, thinking levels, session tree, shell shortcuts, editor context chips, and more.

It does **not** replace Pi. It launches your installed `pi` CLI and reuses `~/.pi/agent` (models, sessions, skills, settings).

<p align="center">
  <img src="https://raw.githubusercontent.com/YeSho-cpp/pi-coding-agent/master/assets/screenshots/pi-agent-ui.png" alt="Pi Coding Agent UI in VS Code" width="720">
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/YeSho-cpp/pi-coding-agent/master/assets/screenshots/welcome-session-list.png" alt="Pi welcome session list" width="720">
</p>

## Fork notice

This repository is a **fork and rebrand** of:

| Project | Role | License |
|---|---|---|
| [frostime/pi-vscode-ui](https://github.com/frostime/pi-vscode-ui) (**FrostPi / Frost UI**) | Primary upstream VS Code UI for Pi | AGPL-3.0 |
| [OpenChamber](https://github.com) (design/code reference) | UI polish reference | see upstream |
| [tintinweb/vscode-pi-model-chat-provider](https://github.com/tintinweb/vscode-pi-model-chat-provider) | Pi brand mark reference | MIT |

- Marketplace / sidebar product name: **Pi Coding Agent UI** (sidebar label: **Pi**)
- Extension ID: `yesho.pi-coding-agent-vscode`
- Settings prefix: `piAgent.*`
- Commands: `Pi Coding Agent: …` / `piAgent.*`

Because FrostPi is **AGPL-3.0**, this fork remains **AGPL-3.0**. Derivative releases must keep source available and preserve attribution. See [`LICENSE`](LICENSE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The historical Frost UI README is kept as [`README.frost-ui.md`](README.frost-ui.md) for reference.

## Prerequisites

1. **Pi CLI** on `PATH` (or set `piAgent.pi.executable`):

   ```bash
   npm install -g @earendil-works/pi-coding-agent
   pi --version
   ```

2. Models / providers configured with Pi (`/login` inside Pi, or your existing `~/.pi` setup).

3. VS Code **1.99+**, trusted workspace.

## Install

### From Marketplace (after publish)

1. Install **Pi Coding Agent UI** (`yesho.pi-coding-agent-vscode`)
2. Open the **Pi** icon in the Activity Bar
3. Start or resume a session

### From VSIX (local)

```bash
code --install-extension "artifacts/Pi Coding Agent-1.0.0.vsix"
```

Reload the window after install.

### Build from source

```bash
pnpm install
pnpm package:vsix
code --install-extension "artifacts/Pi Coding Agent-<version>.vsix"
```

## Highlights

- Sidebar chat for Pi (steer / follow-up, permission modes)
- Model + thinking-level pickers (LobeHub-style vendor icons)
- Session list, resume, tree branch / switch, auto-rename
- Composer: `@` path attach, `+` QuickPick (Material Icon Theme icons when installed), `!` / `!!` shell
- Editor context chip: active (`×`) vs inactive ghost; Esc to detach; Clear wipes all chips
- Markdown, Mermaid, tool cards, diffs, images, save-as-image
- Copilot Chat LM provider optional (`piAgent.persistSessions`)

## Settings

All settings live under **`piAgent.*`** (was `frostui.*` in pre-1.0 Frost UI builds). Open Settings and search `Pi Coding Agent` or `piAgent`.

| Setting | Default | Meaning |
|---|---|---|
| `piAgent.pi.executable` | `""` | Path to `pi` if not on PATH |
| `piAgent.session.autoRename` | `true` | Name sessions from the first prompt |
| `piAgent.agent.permissionMode` | `ask` | `ask` / `autoConfirm` / `restricted` |
| `piAgent.composer.streamingBehavior` | `followUp` | `steer` or `followUp` |

## Marketplace publish (maintainers)

```bash
# 1) Azure DevOps PAT with Marketplace (Publish) scope
# 2) Publisher must exist: yesho
export VSCE_PAT=<your-pat>
pnpm publish:marketplace
```

Or package only:

```bash
pnpm package:vsix
```

## GitHub

Source: [https://github.com/YeSho-cpp/pi-coding-agent](https://github.com/YeSho-cpp/pi-coding-agent)

```bash
git remote add origin https://github.com/YeSho-cpp/pi-coding-agent.git
git push -u origin master
```

## License

AGPL-3.0 — see [LICENSE](LICENSE). Upstream FrostPi remains AGPL-3.0; this distribution must stay AGPL-3.0-compatible and credit upstream.

## Credits

- [Pi coding agent](https://github.com/earendil-works/pi) — Mario Zechner / earendil-works
- [FrostPi / Frost UI](https://github.com/frostime/pi-vscode-ui) — primary upstream VS Code UI
- OpenChamber — interaction / visual reference
- [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) (MIT) — optional QuickPick icons when installed
