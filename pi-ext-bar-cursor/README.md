# @joyanhui/pi-ext-bar-cursor

A [pi](https://pi.dev) extension that replaces the default block (reverse-video) cursor with a vertical bar using the terminal's native hardware cursor shape.

## Features

- **Vertical bar cursor** — uses DECSCUSR (`\x1b[6 q`) to tell the terminal to show a steady vertical bar
- **Block cursor removal** — strips pi's fake block cursor (reverse-video `\x1b[7m`) so the hardware bar cursor is visible
- **Zero text shift** — cursor width is preserved exactly, no crashes or text movement
- **IME compatible** — preserves `CURSOR_MARKER` for IME candidate-window placement

## Installation

```bash
pi install npm:@joyanhui/pi-ext-bar-cursor
```

Or for a single session:

```bash
pi -e npm:@joyanhui/pi-ext-bar-cursor
```

## Requirements

- pi coding agent (v0.x+)
- `showHardwareCursor: true` in pi's `settings.json`

## Usage

Once installed, the extension activates automatically on every session start. No commands or shortcuts needed.

If you're not using a terminal emulator that supports DECSCUSR (the `\x1b[6 q` sequence), you may need to check your terminal's cursor shape support.

## How it works

1. On `session_start`, sends `\x1b[6 q` (DECSCUSR) to set a steady vertical bar cursor
2. Overrides pi's editor component to strip the reverse-video block cursor from each rendered line
3. The hardware bar cursor shows through unobstructed

## Documentation

For more information, visit [dev.leiyanhui.com/ai/pi-bar-cursor](https://dev.leiyanhui.com/ai/pi-bar-cursor/).

## License

MIT
