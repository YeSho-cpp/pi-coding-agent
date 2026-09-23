# Bundled file icons — provenance

The SVG files in this directory are a subset of
[Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)
(`PKief.material-icon-theme`), vendored so this extension can show a colour icon on context chips
even when the user's VS Code has no usable file icon theme active.

- Vendored from version: 5.38.1
- Upstream license: MIT — full text in `LICENSE.material-icon-theme.txt`
- Regenerate with: `node scripts/vendor-bundled-file-icons.mjs`

They are used only as a fallback: when a file icon theme *is* active, the chip follows that theme
instead.
