/**
 * Git Changes Viewer — 查看工作区修改/新增/删除文件列表
 *
 * Install:
 *   pi install npm:@joyanhui/pi-ext-git-changes
 *
 * 三种访问方式：
 *   /changes          — 浮动 overlay，分类展示 git 变更
 *   ctrl+shift+g      — 快捷键拉起 overlay
 *   footer 状态栏      — 常驻显示变更文件计数
 */

import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ThemeColor = "success" | "warning" | "error" | "dim" | "muted" | "text" | "accent" | "border";

interface OverlayResult {
  action: "copy" | "edit" | "yank";
  file: string;
}

/** Write text to system clipboard via OSC 52 escape sequence. */
function osc52Copy(text: string): void {
  const b64 = Buffer.from(text).toString("base64");
  process.stdout.write(`\x1b]52;c;${b64}\x1b\\`);
}

interface GitChange {
  status: string; // XY from "git status --porcelain"
  file: string;
  category: "staged" | "unstaged" | "untracked" | "conflict";
}

interface NavItem {
  type: "header" | "file" | "gap";
  tag?: string; // e.g. "[+]" for staged add
  file?: string;
  catLabel?: string; // e.g. "📦 Staged (3)"
  catColor?: ThemeColor;
}

const CATEGORY_META: Record<GitChange["category"], { emoji: string; label: string; color: ThemeColor }> = {
  staged: { emoji: "📦", label: "Staged", color: "success" },
  unstaged: { emoji: "📝", label: "Unstaged", color: "warning" },
  untracked: { emoji: "❓", label: "Untracked", color: "dim" },
  conflict: { emoji: "⚠️", label: "Conflicts", color: "error" },
};

// Map git porcelain XY to display tag
function statusTag(status: string): string {
  const m: Record<string, string> = {
    "M ": "[+]", "A ": "[+]", "D ": "[-]", "R ": "[~]", "C ": "[+]",
    " M": "[*]", " D": "[-]", "??": "[?]", "!!": "[!]",
    AM: "[+]", MM: "[*]", AD: "[!]", UA: "[!]", UU: "[!]",
  };
  if (m[status]) return m[status];
  if (status.includes("U")) return "[!]";
  return `[${status.trim() || " "}]`;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function parseGitStatus(output: string): GitChange[] {
  const changes: GitChange[] = [];
  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    // Use regex instead of hardcoded offset — robust to extra whitespace
    // between the 2-char XY status and the path
    const m = line.match(/^(.{2})\s+(.*)$/);
    if (!m) continue;
    const status = m[1]!;
    let file = m[2]!;
    // Handle rename/copy format: "oldpath -> newpath"
    if (file.includes(" -> ")) {
      file = file.split(" -> ")[1]!;
    }
    const X = status[0]!;
    const Y = status[1]!;

    let category: GitChange["category"];
    if (X === "?" && Y === "?") category = "untracked";
    else if (X === "U" || Y === "U" || status === "AA" || status === "DD") category = "conflict";
    else if (X !== " " && X !== "?") category = "staged";
    else category = "unstaged";

    changes.push({ status, file, category });
  }
  return changes;
}

async function getGitChanges(pi: ExtensionAPI): Promise<GitChange[] | null> {
  try {
    const result = await pi.exec("git", ["status", "--porcelain"]);
    if (result.code !== 0) return null;
    return parseGitStatus(result.stdout);
  } catch {
    return null;
  }
}

function groupByCategory(changes: GitChange[]): Map<GitChange["category"], GitChange[]> {
  const order: GitChange["category"][] = ["staged", "unstaged", "untracked", "conflict"];
  const map = new Map<GitChange["category"], GitChange[]>();
  for (const cat of order) {
    const group = changes.filter((c) => c.category === cat);
    if (group.length > 0) map.set(cat, group);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

/** Pad or truncate a styled string to exactly `width` display columns. */
function padToWidth(styled: string, width: number): string {
  const vis = visibleWidth(styled);
  if (vis >= width) return truncateToWidth(styled, width);
  return styled + " ".repeat(width - vis);
}

class GitChangesOverlay {
  private theme: Theme;
  private done: (v: OverlayResult | null) => void;
  private items: NavItem[];
  private sel = 0;

  private cacheW = -1;
  private cacheLines: string[] | null = null;

  constructor(changes: GitChange[], theme: Theme, done: (v: OverlayResult | null) => void) {
    this.theme = theme;
    this.done = done;

    const grouped = groupByCategory(changes);
    this.items = [];

    for (const [cat, group] of grouped) {
      const meta = CATEGORY_META[cat];
      this.items.push({
        type: "header",
        catLabel: `${meta.emoji} ${meta.label} (${group.length})`,
        catColor: meta.color,
      });
      for (const c of group) {
        this.items.push({
          type: "file",
          tag: statusTag(c.status),
          file: c.file,
          catColor: meta.color,
        });
      }
      this.items.push({ type: "gap" });
    }

    // Start on first file
    this.sel = this.items.findIndex((i) => i.type === "file");
    if (this.sel < 0) this.sel = 0;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.done(null);
      return;
    }
    const item = this.items[this.sel];
    if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
      if (item?.type === "file" && item.file) this.done({ action: "copy", file: item.file });
      return;
    }
    if (data === "e") {
      if (item?.type === "file" && item.file) this.done({ action: "edit", file: item.file });
      return;
    }
    if (data === "y") {
      if (item?.type === "file" && item.file) this.done({ action: "yank", file: item.file });
      return;
    }
    if (matchesKey(data, Key.up)) {
      for (let i = this.sel - 1; i >= 0; i--) {
        if (this.items[i]!.type === "file") { this.sel = i; this.invalidate(); return; }
      }
    } else if (matchesKey(data, Key.down)) {
      for (let i = this.sel + 1; i < this.items.length; i++) {
        if (this.items[i]!.type === "file") { this.sel = i; this.invalidate(); return; }
      }
    }
  }

  render(width: number): string[] {
    if (this.cacheW === width && this.cacheLines) return this.cacheLines;

    const th = this.theme;
    // width is guaranteed >= minWidth from overlayOptions
    const w = width;
    const inner = w - 2; // content inside │...│

    const B = (s: string): string => th.fg("border", s);

    const lines: string[] = [];
    lines.push(padToWidth(B(`╭${"─".repeat(inner)}╮`), w));

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const sel = i === this.sel;

      if (item.type === "gap") {
        lines.push(padToWidth(B("│") + " ".repeat(inner) + B("│"), w));
        continue;
      }

      if (item.type === "header") {
        const color = item.catColor || "accent";
        const label = item.catLabel || "";
        const body = padToWidth(th.fg(color, th.bold ? th.bold(label) : label), inner);
        lines.push(padToWidth(B("│") + body + B("│"), w));
        continue;
      }

      // File entry
      const marker = sel ? th.fg("accent", "▶ ") : "  ";
      const tag = item.tag || "";
      const fname = item.file || "";
      const tagColor: ThemeColor = item.catColor || "text";
      const fnameColor: ThemeColor = sel ? "accent" : "text";

      const body = marker + th.fg(tagColor, tag) + " " + th.fg(fnameColor, fname);
      lines.push(padToWidth(B("│") + padToWidth(body, inner) + B("│"), w));
    }

    // Footer hint
    const hint = th.fg("dim", "↑↓ move  Enter→editor  e=edit(nvim)  y=yank  Esc=close");
    lines.push(padToWidth(B("│") + padToWidth(hint, inner) + B("│"), w));

    lines.push(padToWidth(B(`╰${"─".repeat(inner)}╯`), w));

    this.cacheW = width;
    this.cacheLines = lines;
    return lines;
  }

  invalidate(): void { this.cacheW = -1; this.cacheLines = null; }
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function buildStatusText(changes: GitChange[]): string {
  if (changes.length === 0) return "";
  const counts: Record<string, number> = {};
  for (const c of changes) counts[c.category] = (counts[c.category] || 0) + 1;

  const parts: string[] = [];
  if (counts.staged) parts.push(`📦${counts.staged}`);
  if (counts.unstaged) parts.push(`📝${counts.unstaged}`);
  if (counts.untracked) parts.push(`❓${counts.untracked}`);
  if (counts.conflict) parts.push(`⚠️${counts.conflict}`);
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  const STATUS_KEY = "git-changes";

  async function refreshStatus(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    const t = ctx.ui.theme;
    const changes = await getGitChanges(pi);
    if (changes === null) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const text = buildStatusText(changes);
    if (text) {
      ctx.ui.setStatus(STATUS_KEY,
        t.fg("accent", "C-S-g") + t.fg("dim", ":" + text));
    } else {
      ctx.ui.setStatus(STATUS_KEY,
        t.fg("accent", "C-S-g") + t.fg("dim", ":✓"));
    }
  }

  async function showOverlay(ctx: ExtensionContext) {
    if (!ctx.hasUI) {
      ctx.ui.notify("Git changes viewer requires TUI mode", "warning");
      return;
    }

    const changes = await getGitChanges(pi);
    if (changes === null) {
      ctx.ui.notify("Not a git repository (or git not available)", "warning");
      return;
    }
    if (changes.length === 0) {
      ctx.ui.notify("Working tree clean — no changes", "info");
      return;
    }

    const result = await ctx.ui.custom<OverlayResult | null>((_tui, theme, _kb, done) => {
      const ov = new GitChangesOverlay(changes, theme, done);
      return {
        render: (w: number) => ov.render(w),
        invalidate: () => ov.invalidate(),
        handleInput: (d: string) => ov.handleInput(d),
      };
    }, { overlay: true, overlayOptions: { minWidth: 44, maxHeight: "80%" } });

    if (result) {
      switch (result.action) {
        case "copy":
          ctx.ui.setEditorText(result.file);
          ctx.ui.notify(`→ editor: ${result.file}`, "info");
          break;
        case "edit":
          // Suspend-like: spawn nvim, let it take over the terminal
          ctx.ui.notify(`nvim ${result.file}`, "info");
          spawnSync("nvim", [result.file], { stdio: "inherit" });
          break;
        case "yank":
          osc52Copy(result.file);
          ctx.ui.notify(`📋 yanked: ${result.file}`, "info");
          break;
      }
    }
  }

  // /changes command
  pi.registerCommand("changes", {
    description: "Show git working tree changes (modified/added/deleted files)",
    handler: async (_args, ctx) => { await showOverlay(ctx); },
  });

  // ctrl+shift+g shortcut
  pi.registerShortcut("ctrl+shift+g", {
    description: "Show git changes overlay",
    handler: async (ctx) => { await showOverlay(ctx); },
  });

  // Auto-refresh status after file-modifying operations
  pi.on("session_start", async (_e, ctx) => { await refreshStatus(ctx); });
  pi.on("tool_result", async (e, ctx) => {
    if (e.toolName === "bash" || e.toolName === "write" || e.toolName === "edit") {
      await refreshStatus(ctx);
    }
  });
  pi.on("user_bash", async (_e, ctx) => { await refreshStatus(ctx); });
}
