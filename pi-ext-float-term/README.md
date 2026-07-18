# @joyanhui/pi-ext-float-term

A [pi](https://pi.dev) extension providing **floating terminal overlays** powered by `node-pty`. Similar to Neovim's `<leader>ft` floating terminal.

## Features

- **Floating fish shell** — `Ctrl+Alt+F` opens an interactive fish terminal in an overlay
- **Floating lazygit** — `Ctrl+Alt+G` opens lazygit in a floating terminal
- **Floating yazi** — `Ctrl+Alt+Y` opens the yazi file manager
- **Floating gcp** — `Ctrl+Shift+Alt+G` runs gcp (git conventional commits) then drops into fish
- **Exit gracefully** — `exit` / `Ctrl+D` quits the shell and auto-closes; `Ctrl+Space` force-closes

## Installation

```bash
pi install npm:@joyanhui/pi-ext-float-term
```

Or for a single session:

```bash
pi -e npm:@joyanhui/pi-ext-float-term
```

## Commands

| Command | Description |
|---------|-------------|
| `/float-fish` | Open floating fish terminal |
| `/float-lazygit` | Open floating lazygit |
| `/float-yazi` | Open floating yazi file manager |

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+F` | Floating fish shell |
| `Ctrl+Alt+G` | Floating lazygit |
| `Ctrl+Alt+Y` | Floating yazi |
| `Ctrl+Shift+Alt+G` | Floating gcp (git commit + push) |

## Requirements

- pi coding agent (v0.x+)
- `node-pty` (included as dependency, auto-installed)

## License

MIT
