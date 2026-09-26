---
title: Conversation Markdown Rendering
description: Sanitization, file references, streaming Mermaid, and source-text copy behavior.
scope:
  - /apps/vscode/src/webview/features/conversation/markdown/**
  - /apps/vscode/src/webview/features/conversation/diffPresentation.ts
updated: 2026-09-26
---

# Conversation Markdown Rendering

- Ordinary Markdown uses `markdown-it` with raw HTML disabled, then sanitizes output. Mermaid uses strict security, sanitizes SVG, and fails closed without injecting raw output.
- Markdown image syntax renders an inert sanitized placeholder before any source is activated. Relative paths resolve from the displayed Session cwd; absolute paths and `file:` URIs refer to the Extension Host filesystem. Local and supported `data:` images load automatically near the viewport, while HTTPS images require an explicit `Load image` action and send no referrer. HTTP and other schemes remain blocked.
- Host-loaded images are bounded by the configured attachment byte limit. Supported formats are PNG, JPEG, WebP, GIF, and SVG; malformed image data fails through the browser image decoder. Local and `data:` SVG removes `<script>` elements before it becomes a Blob URL; if scripts were removed, the image shows a warning. SVG is never injected into the rendered Markdown DOM. Remote SVG remains isolated as an `<img>` and is not content-inspected.
- Markdown images preserve aspect ratio, do not upscale, fit within 92% of the message width and a 640px maximum, and use `min(400px, 55vh)` as their transcript height bound. An explicit Markdown title is a centered caption without surrounding card chrome. When no title is present, concise alt text (up to 160 Unicode characters) is used as the caption; long alt text remains only the accessible/failure description. Unlinked loaded images open the shared Lightbox, while linked images retain link behavior.
- Explicit Markdown file links and whitelisted inline-code references open through validated `openFile`; supported locations include line, column, line-range, and GitHub `#L` forms. Inline-code file chips whose source contains a path separator display only the final segment plus any line suffix (`file.ts:42`), with the raw reference in the `title` tooltip; `data-file-path` keeps the parsed path for opening, and an icon-theme artwork `<img class="file-chip-icon">` is injected in front of the label after sanitization via a `fileIcon` bridge request. When the resolved path does not exist, the host jumps to the best workspace file search match (basename for stale absolute paths) and keeps line/column as best-effort; with no match the open fails with the original error. HTTP(S) remains external.
- Incomplete Mermaid fences remain source text while streaming; only complete fences mount a diagram, and render failure shows the error plus original source.
- Fenced code blocks get a hover/focus action group (injected by `MarkdownHtml.svelte`, not part of sanitized HTML). Copy sends the block's raw code text through `copyText` and confirms in place briefly. Wrap is not user-togglable; the wrapping default comes from the fence language.
- Fence chrome: the outer `pre` clips, a `.code-head` carries the language label on the left and the Copy action on the right, and the inner `.code-scroll` scrolls so the header stays put. Every fence has a head, so Copy always lands top-right; untagged fences and indented code blocks are labelled `txt`. Prose-like languages (`txt`, `text`, `plaintext`, `md`, `markdown`, `tex`, `latex`) wrap by default, other and untagged fences scroll.
- `diff` and `patch` fences use VS Code Diff theme colors for full-line additions and deletions. Equal-sized adjacent deletion/addition runs also emphasize the changed substring when corresponding lines retain enough shared text; uncertain pairs fall back to whole-line highlighting. Recognized tool-result diffs share this classification and substring-emphasis model while retaining their compact tool-card chrome.
- Copy uses original protocol text in order, never rendered HTML, SVG, math markup, images, reasoning, tools, or notices.
