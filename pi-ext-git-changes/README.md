# @joyanhui/pi-ext-git-changes

A [pi](https://pi.dev) extension providing an interactive **git working tree changes viewer** with a categorized overlay, keyboard shortcut, and a persistent footer status.

## Features

- **`/changes` command** — opens an overlay showing staged, unstaged, untracked, and conflicted files
- **`Ctrl+Shift+G` shortcut** — same overlay, instant access
- **Footer status** — always visible file change counts (e.g. `C-S-g:📦3 📝2 ❓1`)
- **Actions** — press `Enter` to open file in editor, `e` to edit with nvim, `y` to yank filename
- **Clean tree** — shows `✓` when working tree is clean

## Installation

```bash
pi install npm:@joyanhui/pi-ext-git-changes
```

Or for a single session:

```bash
pi -e npm:@joyanhui/pi-ext-git-changes
```

## Usage

### Overlay navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate files |
| `Enter` | Open file in pi editor |
| `e` | Edit file with nvim |
| `y` | Yank (copy) file path to clipboard |
| `Esc` / `Ctrl+C` | Close overlay |

### Footer status

The extension shows a status indicator in pi's footer bar. For example:
- `C-S-g:📦3 📝2 ❓1` — 3 staged, 2 unstaged, 1 untracked
- `C-S-g:✓` — working tree clean

## Requirements

- pi coding agent (v0.x+)

## License

MIT
