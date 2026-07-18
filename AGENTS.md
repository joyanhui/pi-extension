# pi-extension — Monorepo

A collection of [pi](https://pi.dev) coding agent extensions published on npm under `@joyanhui`.

## Packages

- **pi-ext-bar-cursor** — Replaces block cursor with a vertical bar via DECSCUSR.
- **pi-ext-float-term** — Floating terminal overlay (fish, lazygit, yazi, gcp) using node-pty.
- **pi-ext-git-changes** — Interactive git working tree changes viewer with overlay and status.

## Tech Stack

- TypeScript, pi SDK (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`)
- `node-pty` for PTY emulation (float-term)
- npm workspaces (each package is self-contained)

## Project Conventions

- Each extension has its own `package.json` and is published independently.
- Bump version per-package via `npm version patch|minor|major` then `npm publish`.
