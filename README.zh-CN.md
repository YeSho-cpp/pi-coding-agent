<p align="center">
  <img src="apps/vscode/assets/icon.png" alt="Pi Coding Agent" width="128">
</p>

<h1 align="center">Pi Coding Agent</h1>

<p align="center">
  <strong>在 VS Code 里使用 <a href="https://pi.dev">Pi</a> 的可视化界面 —— 沿用你本机的 CLI、配置、模型与会话。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

**Pi Coding Agent** 是驱动 [Mario Zechner](https://github.com/badlogic) 开源项目 [Pi coding agent](https://github.com/earendil-works/pi) 的 VS Code 扩展：侧边栏对话、工具卡片、模型选择、思考档位、会话树、Shell 快捷方式、编辑器上下文 chip 等。

它**不替代** Pi，而是启动你已安装的 `pi` CLI，并复用 `~/.pi/agent`（模型、会话、技能、配置）。

## Fork 说明（务必保留）

本仓库是以下项目的 **fork / 重命名发行版**：

| 上游 | 说明 | 许可证 |
|---|---|---|
| [frostime/pi-vscode-ui](https://github.com/frostime/pi-vscode-ui)（**FrostPi / Frost UI**） | 主要上游 VS Code UI | **AGPL-3.0** |
| OpenChamber | 交互与视觉参考 | 见上游 |
| [tintinweb/vscode-pi-model-chat-provider](https://github.com/tintinweb/vscode-pi-model-chat-provider) | Pi 品牌标识参考 | MIT |

- 产品名（市场）：**Pi Coding Agent**
- 侧边栏名称：**Pi**
- 扩展 ID：`yesho.pi-coding-agent`
- 配置前缀：`piAgent.*`
- 命令：`Pi Coding Agent: …`

FrostPi 为 **AGPL-3.0**，因此本发行版同样以 **AGPL-3.0** 发布，衍生分发需保持开源并保留上游署名。详见 [`LICENSE`](LICENSE) 与 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。历史 Frost UI 说明见 [`README.frost-ui.md`](README.frost-ui.md)。

## 环境要求

1. 系统 `PATH` 上有 **Pi CLI**（或在设置中指定 `piAgent.pi.executable`）：

   ```bash
   npm install -g @earendil-works/pi-coding-agent
   pi --version
   ```

2. 已用 Pi 配置好模型 / Provider。

3. VS Code **1.99+**，受信任工作区。

## 安装

### 市场（发布后）

安装扩展 **Pi Coding Agent**（`yesho.pi-coding-agent`），打开活动栏 **Pi** 图标。

### 本地 VSIX

```bash
code --install-extension "artifacts/Pi Coding Agent-1.0.0.vsix"
```

安装后请 **Reload Window**。

### 源码构建

```bash
pnpm install
pnpm package:vsix
code --install-extension "artifacts/Pi Coding Agent-<version>.vsix"
```

## 功能摘要

- Pi 侧边栏会话（steer / follow-up、权限模式）
- 模型与思考档位选择
- 会话列表 / 恢复 / 树分支 / 自动命名
- Composer：`@` 路径、`+` QuickPick（若已装 Material Icon Theme 则用其图标）、`!` / `!!` shell
- 编辑器上下文 chip：生效（带 ×）/ 不生效虚化；Esc 取消；Clear 一键清空
- Markdown、Mermaid、工具卡片、diff、图片、导出图片

## 配置

搜索 `piAgent` 或 `Pi Coding Agent`。1.0 之前 Frost UI 使用的 `frostui.*` 已更名为 `piAgent.*`。

## 发布

### VS Code Marketplace

```bash
export VSCE_PAT=<Azure DevOps PAT，含 Marketplace Publish 权限>
pnpm publish:marketplace
```

发布者 ID 需为 **`yesho`**。

### GitHub

仓库：[https://github.com/YeSho-cpp/pi-coding-agent](https://github.com/YeSho-cpp/pi-coding-agent)

## 许可证

AGPL-3.0，见 [LICENSE](LICENSE)。请在衍生作品中注明基于 FrostPi / Frost UI。

## 致谢

- [Pi](https://github.com/earendil-works/pi) — Mario Zechner / earendil-works  
- [FrostPi / Frost UI](https://github.com/frostime/pi-vscode-ui) — 主要上游  
- OpenChamber — 设计参考  
- [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)（MIT）— 可选文件图标  
