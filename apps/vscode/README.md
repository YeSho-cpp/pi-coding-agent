<p align="center">
  <img src="https://raw.githubusercontent.com/YeSho-cpp/pi-coding-agent/master/apps/vscode/assets/icon.png" alt="Pi Coding Agent UI" width="128">
</p>

<h1 align="center">Pi Coding Agent UI</h1>

<p align="center">
  <strong>A <b>Visual Studio Code extension</b> for <a href="https://github.com/earendil-works/pi">Pi Coding Agent</a></strong><br>
  Native sidebar, editor-context attach, worktree sessions — built around VS Code, not a standalone chat app.
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=yesho.pi-coding-agent-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/yesho.pi-coding-agent-vscode?style=flat-square&label=VS%20Marketplace&logo=visual-studio-code" alt="Marketplace"></a>
  <img src="https://img.shields.io/badge/VS%20Code-1.99%2B-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white" alt="VS Code">
  <img src="https://img.shields.io/github/license/YeSho-cpp/pi-coding-agent?style=flat-square" alt="License">
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=yesho.pi-coding-agent-vscode"><b>Install from VS Code Marketplace</b></a>
</p>

**Pi Coding Agent UI** is first and foremost a **VS Code extension** (`yesho.pi-coding-agent-vscode`). It puts [Pi](https://github.com/earendil-works/pi) into the IDE you already use: Activity Bar sidebar, editor-driven context, workspace-aware sessions, and VS Code-native settings/commands.

It does **not** replace the Pi CLI. The extension launches your installed `pi` and reuses `~/.pi/agent` (models, sessions, skills, settings).

<p align="center">
  <img src="https://raw.githubusercontent.com/YeSho-cpp/pi-coding-agent/master/assets/screenshots/pi-agent-ui.png" alt="Pi Coding Agent UI in VS Code" width="720">
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/YeSho-cpp/pi-coding-agent/master/assets/screenshots/welcome-session-list.png" alt="Pi welcome session list in VS Code" width="720">
</p>

## VS Code adaptation (why this is an editor extension)

| VS Code surface | What you get |
|---|---|
| **Activity Bar** | Dedicated **Pi** view container + sidebar webview (`piAgent.chat`) |
| **Editor** | Open file / selection as context chips; `×` or **Esc** in the editor to detach |
| **Workspace** | Sessions scoped to the opened folder & git worktrees (same `~/.pi/agent` store as terminal `pi`) |
| **Quick Pick** | `+` attach uses VS Code Quick Pick; **Material Icon Theme** icons when that extension is installed |
| **Commands & keys** | Command Palette: `Pi Coding Agent: …`; Esc to dismiss chips/menus |
| **Settings UI** | All knobs under **`piAgent.*`** in VS Code Settings |
| **Trusted workspaces** | Extension only activates in trusted folders (Pi gets shell/files access) |
| **Theme** | UI follows your VS Code color theme (not a fixed web chat skin) |
| **Panels** | Optional editor-tab session panel; diagnostics export via host |
| **Shell** | Composer `!` / `!!` run through the extension host’s terminal integration |

### In-product surfaces

- Welcome home: large Pi mark, **current-folder session list**, `…` rename/delete, top bar (version / extensions / skills / settings)
- Session UI: model picker, thinking level, tool cards, markdown/Mermaid, context ring, permission bar
- Optional: LM provider path for Copilot Chat consumers (`piAgent.*` persist settings)

## Fork notice

This repository is a **fork and rebrand** focused on **VS Code**:

| Project | Role | License |
|---|---|---|
| [frostime/pi-vscode-ui](https://github.com/frostime/pi-vscode-ui) (**FrostPi / Frost UI**) | Primary upstream **VS Code** UI for Pi | AGPL-3.0 |
| OpenChamber | Editor UI polish reference | see upstream |
| [tintinweb/vscode-pi-model-chat-provider](https://github.com/tintinweb/vscode-pi-model-chat-provider) | Pi brand mark reference (also a VS Code extension) | MIT |

- Marketplace name: **Pi Coding Agent UI** — sidebar label: **Pi**
- Extension ID: `yesho.pi-coding-agent-vscode`
- Settings: `piAgent.*` · Commands: `piAgent.*`

AGPL-3.0 applies to this distribution. See [`LICENSE`](LICENSE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Legacy notes: [`README.frost-ui.md`](README.frost-ui.md).

## Prerequisites (VS Code)

1. **VS Code 1.99+**, trusted workspace  
2. **Pi CLI** on `PATH` (or `piAgent.pi.executable`):

   ```bash
   npm install -g @earendil-works/pi-coding-agent
   pi --version
   ```

3. Models configured with Pi (`~/.pi` as in the terminal)

## Install as a VS Code extension

### Marketplace

1. Open **[Pi Coding Agent UI](https://marketplace.visualstudio.com/items?itemName=yesho.pi-coding-agent-vscode)** in the Marketplace (or search inside VS Code: Extensions)  
2. **Install**  
3. Click **Pi** in the **Activity Bar**  

### VSIX (sideload)

```bash
code --install-extension "artifacts/Pi Coding Agent-<version>.vsix"
# then: Developer: Reload Window
```

### From source

```bash
pnpm install
pnpm package:vsix
code --install-extension "artifacts/Pi Coding Agent-<version>.vsix"
```

## VS Code settings (`piAgent.*`)

Search **Pi Coding Agent** in VS Code Settings.

| Setting | Default | Meaning |
|---|---|---|
| `piAgent.pi.executable` | `""` | Path to `pi` if not on PATH |
| `piAgent.session.autoRename` | `true` | Name sessions from the first prompt |
| `piAgent.agent.permissionMode` | `ask` | `ask` / `autoConfirm` / `restricted` |
| `piAgent.composer.streamingBehavior` | `followUp` | `steer` or `followUp` |

## Maintain / publish

```bash
# Publisher: yesho · Extension id: yesho.pi-coding-agent-vscode
export VSCE_PAT=<Azure DevOps PAT with Marketplace Manage>
pnpm publish:marketplace   # or upload VSIX in Marketplace manage UI
```

## GitHub

[https://github.com/YeSho-cpp/pi-coding-agent](https://github.com/YeSho-cpp/pi-coding-agent)

## License

AGPL-3.0 — keep source available and credit upstream FrostPi / Frost UI.

## Credits

- [Pi](https://github.com/earendil-works/pi) — Mario Zechner / earendil-works  
- [FrostPi / Frost UI](https://github.com/frostime/pi-vscode-ui) — upstream VS Code UI  
- [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) (MIT) — optional Quick Pick icons  
