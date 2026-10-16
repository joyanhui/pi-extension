# pi-extension

A monorepo of [pi](https://pi.dev) coding agent extensions, published on npm as `@joyanhui/pi-ext-*`.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [pi-ext-bar-cursor](./pi-ext-bar-cursor) | [@joyanhui/pi-ext-bar-cursor](https://www.npmjs.com/package/@joyanhui/pi-ext-bar-cursor) | Replaces block cursor with a vertical bar (DECSCUSR) |
| [pi-ext-float-term](./pi-ext-float-term) | [@joyanhui/pi-ext-float-term](https://www.npmjs.com/package/@joyanhui/pi-ext-float-term) | Floating terminal overlay (fish, lazygit, yazi) |
| [pi-ext-git-changes](./pi-ext-git-changes) | [@joyanhui/pi-ext-git-changes](https://www.npmjs.com/package/@joyanhui/pi-ext-git-changes) | Interactive git working tree changes viewer |

## Install via pi

```bash
pi install npm:@joyanhui/pi-ext-bar-cursor
pi install npm:@joyanhui/pi-ext-float-term
pi install npm:@joyanhui/pi-ext-git-changes
```

Or all at once by adding to `~/.pi/agent/settings.json`:

```json
{
  "packages": [
    "npm:@joyanhui/pi-ext-bar-cursor",
    "npm:@joyanhui/pi-ext-float-term",
    "npm:@joyanhui/pi-ext-git-changes"
  ]
}
```

## Native dependency for pi-ext-float-term

`node-pty` is a native optional dependency; on Linux install `python3`, `make`, and `g++` first.

```bash
sudo apt install -y python3 make g++
npm install -g --allow-scripts=node-pty node-gyp node-pty
```

If needed, set `FLOAT_TERM_NODE_PTY="$(npm root -g)/node-pty"` and restart pi. See [`pi-ext-float-term/README.md`](./pi-ext-float-term/README.md).


## Development

Each package is self-contained in its own directory. To publish an updated version:

```bash
cd pi-ext-<name>
npm version patch   # or minor / major
npm publish
```

## License

MIT
