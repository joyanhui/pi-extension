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
| `Ctrl+Alt+F` | Floating fish shell |
| `Ctrl+Alt+G` | Floating lazygit |
| `Ctrl+Alt+Y` | Floating yazi |
| `Ctrl+Shift+Alt+G` | Floating gcp (git commit + push) |

### gcp — Interactive Git Commit & Push

The `gcp` function (triggered via `Ctrl+Shift+Alt+G`) is an interactive helper for creating [Conventional Commits](https://www.conventionalcommits.org/) and pushing them. It automates the `git add . && git commit -m "..." && git push` workflow.

**How it works:**

1. **Shows working tree overview** — displays `git status --short` so you can review what will be staged
2. **Prompts for commit type** — select from a numbered list of conventional commit types:

| # | Type | Description |
|---|------|-------------|
| 1 | `✨feat` | A new feature |
| 2 | `🐛fix` | A bug fix |
| 3 | `📝docs` | Documentation only changes |
| 4 | `💄style` | Formatting, whitespace, missing semicolons (no logic change) |
| 5 | `♻️refactor` | Code refactoring (neither feat nor fix) |
| 6 | `⚡perf` | Performance improvement |
| 7 | `✅test` | Adding or modifying tests |
| 8 | `👷build` | Build system, dependencies, CI configuration |
| 9 | `🔧chore` | Maintenance, tooling, config files, gitignore |
| 10 | `⏪revert` | Revert a previous commit |
| 11 | `🔄update` | Dependency updates, toolchain version bumps, library upgrades |

3. **Prompts for commit description** — enter a short summary (required)
4. **Executes** — runs `git add .`  then `git commit -m "<type>: <description>"` then `git push`

The function defaults to type `✨feat` (option 1) if you press Enter without selecting a number.

## Documentation

For more information, visit [dev.leiyanhui.com/ai/pi-float-term](https://dev.leiyanhui.com/ai/pi-float-term/).

For source code, visit [github.com/joyanhui/pi-extension](https://github.com/joyanhui/pi-extension).

## License

MIT
