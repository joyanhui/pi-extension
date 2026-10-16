# @joyanhui/pi-ext-float-term

A [pi](https://pi.dev) extension providing **floating terminal overlays** powered by `node-pty`. Similar to Neovim's `<leader>ft` floating terminal.

## Features

- **Floating system shell** — `Ctrl+Alt+S` opens the system default shell in an overlay
  - Windows: `FLOAT_TERM_SHELL`, then `ComSpec`/`COMSPEC`, finally `cmd.exe`
  - Unix: `FLOAT_TERM_SHELL`, then `SHELL`, finally `/bin/sh`
- **Floating lazygit** — `Ctrl+Alt+G` opens lazygit in a floating terminal
- **Floating yazi** — `Ctrl+Alt+Y` opens the yazi file manager
- **Exit gracefully** — `exit` / `Ctrl+D` quits the shell and auto-closes; `Ctrl+Space` force-closes

## Installation

```bash
pi install npm:@joyanhui/pi-ext-float-term
```

Or for a single session:

```bash
pi -e npm:@joyanhui/pi-ext-float-term
```

## Requirements

- pi coding agent (v0.x+)
- `node-pty` is an optional native dependency; Linux requires `python3`, `make`, and `g++`.
- Install it with `npm install -g --allow-scripts=node-pty node-gyp node-pty`.
- With pnpm, run `pnpm approve-builds`, approve `node-pty`, then run `pnpm rebuild node-pty`.
- If needed, set `FLOAT_TERM_NODE_PTY` to its package directory and restart pi:

```bash
export FLOAT_TERM_NODE_PTY="$(npm root -g)/node-pty"
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
| `Ctrl+Alt+S` | Floating system default shell |
| `Ctrl+Alt+G` | Floating lazygit |
| `Ctrl+Alt+Y` | Floating yazi |
## Documentation

For more information, visit [dev.leiyanhui.com/ai/pi-float-term](https://dev.leiyanhui.com/ai/pi-float-term/).

For source code, visit [github.com/joyanhui/pi-extension](https://github.com/joyanhui/pi-extension).

## License

MIT
