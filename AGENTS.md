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

## Release Status

| Package | npm latest | Notes |
| --- | --- | --- |
| pi-ext-bar-cursor | 1.0.3 | v1.0.3 fixes hidden cursor on new pi: calls `tui.setShowHardwareCursor(true)` and handles both `ESC[0m` / `ESC[27m` reverse-video end sequences |
| pi-ext-float-term | 1.0.3 | v1.0.3 fixes Linux install failure: node-pty moved to `optionalDependencies`, loaded at runtime from FLOAT_TERM_NODE_PTY / local / bun global / npm global; needs node-gyp + python3/make/g++ on Linux |
| pi-ext-git-changes | 1.0.2 | v1.0.2 replaces shortcut `ctrl+shift+g` with `ctrl+shift+c` (the former became built-in `tui.altScreen.searchPrevious`) |

## pi.dev Package Spec

Source of truth: `packages.md` and `extensions.md` inside `@earendil-works/pi-coding-agent` docs.

- Package is discovered via `package.json`, `keywords` must include `pi-package`.
- Resources are declared under `pi` key, e.g. `pi.extensions: ["./bar-cursor.ts"]`; paths are relative to package root and support globs.
- Pi bundles core packages, so imports of `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox` go in `peerDependencies` with `"*"` and are never bundled.
- Other packages must be listed in `dependencies` and `bundledDependencies`.
- `files` whitelist keeps the tarball minimal (extension source, README, LICENSE, package.json).
- Runtime deps come from production installs (`--omit=dev`), so devDependencies are unavailable at runtime.

## npm Release Method

- Log in first: `npm whoami` must return your username; otherwise `npm login`.
- Verify contents: `npm pack --dry-run --json` before publishing.
- Bump and publish from the package dir:
  `npm version patch` then `npm publish` (do not use `--workspace`, this repo has no root package.json).
- Publishing to npm requires a one-time password; the CLI prints an auth URL (token is redacted to `***` in logs, so re-run to get a fresh URL) or pass `--otp`.
- After publish, confirm `npm view @joyanhui/<pkg> version dist-tags.latest`.
- Update the local pi install: `pi update npm:@joyanhui/<pkg>` (the running npm package, not a local path).
- For local testing before release: `pi install ./<pkg-dir>` then remove it again with `pi remove ../../myws/pi-extension/<pkg-dir>` (relative source as shown by `pi list`).
- float-term depends on node-pty (native addon, no Linux prebuild). On Linux ensure `node-gyp` (+ python3/make/g++) is in PATH, e.g. `bun add -g node-gyp`; node-pty is an `optionalDependency` and is resolved at runtime.

## Bar Cursor Notes

- `showHardwareCursor` defaults to false; the extension forces it on at session start via `tui.setShowHardwareCursor(true)` inside the editor factory, so no `settings.json` change is required.
- It preserves pi's `CURSOR_MARKER` so IME candidate-window positioning still works, and strips only the fake reverse-video block cursor.