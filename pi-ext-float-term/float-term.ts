/**
 * Float Term — 浮动终端 (floating terminal overlay for pi)
 *
 * Install:
 *   pi install npm:@joyanhui/pi-ext-float-term
 *
 * 用法：
 *   Ctrl+Alt+F  — 弹出一个浮动的 fish 终端小窗（居中，85% 宽 x 75% 高）
 *   Ctrl+Alt+G  — 浮动 lazygit
 *   Ctrl+Alt+Y  — 浮动 yazi
 *   Ctrl+Shift+Alt+G — 浮动 gcp (git conventional commits)
 *
 * 交互：
 *   正常输入 → 发送到终端
 *   exit / Ctrl+D → 退出 shell，自动关闭
 *   Ctrl+Space → 强制关闭浮动终端
 *
 * 类似 Neovim 的 <leader>ft 浮动终端。
 * 基于 node-pty 实现真正的 PTY 终端模拟。
 *
 * 可通过 FLOAT_TERM_SHELL 环境变量自定义 shell（默认 fish）。
 */

import type { IPty } from "node-pty";
import { spawn as ptySpawn } from "node-pty";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CellAttrs {
  fg?: number;
  bg?: number;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  reverse?: boolean;
}

interface Cell {
  char: string;
  attrs: CellAttrs;
}

const EMPTY_ATTRS: CellAttrs = {};

function cloneAttrs(a: CellAttrs): CellAttrs {
  if (a === EMPTY_ATTRS) return {};
  if (
    !a.fg &&
    !a.bg &&
    !a.bold &&
    !a.dim &&
    !a.italic &&
    !a.underline &&
    !a.reverse
  )
    return {};
  return {
    fg: a.fg,
    bg: a.bg,
    bold: a.bold,
    dim: a.dim,
    italic: a.italic,
    underline: a.underline,
    reverse: a.reverse,
  };
}

function attrsEqual(a: CellAttrs, b: CellAttrs): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.reverse === b.reverse
  );
}

// ---------------------------------------------------------------------------
// Cell → ANSI SGR styled string
// ---------------------------------------------------------------------------

function cellToSGR(cell: Cell): string {
  const a = cell.attrs;
  const codes: number[] = [];

  if (a.bold) codes.push(1);
  if (a.dim) codes.push(2);
  if (a.italic) codes.push(3);
  if (a.underline) codes.push(4);

  // Resolve reverse at render-time: swap fg/bg with sensible defaults.
  // Never emit \x1b[7m — the terminal's native reverse interacts poorly
  // with explicit colours and causes flickering.
  let fg = a.fg;
  let bg = a.bg;
  if (a.reverse) {
    // Swap; supply terminal-appropriate defaults.
    // Default bg → dark (0).  Default fg → light (7).
    const tmp = fg;
    fg = bg ?? 0;
    bg = tmp ?? 7;
  }

  if (fg !== undefined) {
    if (fg < 8) codes.push(30 + fg);
    else if (fg < 16) codes.push(90 + (fg - 8));
    else codes.push(38, 5, fg);
  }
  if (bg !== undefined) {
    if (bg < 8) codes.push(40 + bg);
    else if (bg < 16) codes.push(100 + (bg - 8));
    else codes.push(48, 5, bg);
  }

  if (codes.length === 0) return cell.char;
  return `\x1b[${codes.join(";")}m${cell.char}`;
}

// ---------------------------------------------------------------------------
// Unicode width & colour helpers
// ---------------------------------------------------------------------------

/** Map 24-bit RGB to the closest entry in the 256-colour palette. */
function rgbTo256(r: number, g: number, b: number): number {
  // Greyscale ramp (232-255)
  if (r === g && g === b) {
    if (r <= 7) return 16;
    if (r >= 248) return 231;
    return Math.round((r - 8) / 10) + 232;
  }
  // 6×6×6 colour cube (16-231)
  const ri = Math.max(0, Math.min(5, Math.round(r / 51)));
  const gi = Math.max(0, Math.min(5, Math.round(g / 51)));
  const bi = Math.max(0, Math.min(5, Math.round(b / 51)));
  return 16 + 36 * ri + 6 * gi + bi;
}

/** Rough East-Asian width check. Returns 2 for CJK / fullwidth / emoji, 1 otherwise. */
function charWidth(cp: number): number {
  // CJK Radicals Supplement .. CJK Symbols
  if (cp >= 0x2e80 && cp <= 0x303e) return 2;
  // Hiragana, Katakana, Bopomofo, Hangul Compatibility Jamo, Kanbun
  if (cp >= 0x3040 && cp <= 0x3247) return 2;
  // Enclosed CJK
  if (cp >= 0x3200 && cp <= 0x33bf) return 2;
  // CJK Unified Ideographs Extension A .. Yijing
  if (cp >= 0x3400 && cp <= 0xa4cf) return 2;
  // Hangul Jamo Extended-A, B
  if (cp >= 0xa960 && cp <= 0xd7af) return 2;
  // CJK Compatibility Ideographs
  if (cp >= 0xf900 && cp <= 0xfaff) return 2;
  // Vertical forms, CJK Compatibility Forms
  if (cp >= 0xfe10 && cp <= 0xfe6f) return 2;
  // Fullwidth Forms, Fullwidth Signs
  if (cp >= 0xff01 && cp <= 0xff60) return 2;
  if (cp >= 0xffe0 && cp <= 0xffe6) return 2;
  // Emoji & Symbols
  if (cp >= 0x1f000 && cp <= 0x1f9ff) return 2;
  // CJK Unified Ideographs Extension B .. G
  if (cp >= 0x20000 && cp <= 0x3134f) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Terminal Buffer — minimal ANSI terminal emulator
// ---------------------------------------------------------------------------

class TermBuffer {
  cols: number;
  rows: number;
  private grid: Cell[][];
  private cursorX = 0;
  private cursorY = 0;
  private attrs: CellAttrs = { ...EMPTY_ATTRS };
  private savedX = 0;
  private savedY = 0;
  private savedAttrs: CellAttrs = { ...EMPTY_ATTRS };

  // Alternate screen buffer (for lazygit, vim, etc.)
  private altGrid: Cell[][] | null = null;
  private altCursorX = 0;
  private altCursorY = 0;
  private altAttrs: CellAttrs = { ...EMPTY_ATTRS };
  private useAltScreen = false;

  // Parser state — "escNext" swallows the single character after ESC ( / )
  private escState: "normal" | "esc" | "escNext" | "csi" | "osc" | "oscEsc" =
    "normal";
  private csiParams = "";

  // Buffer for query detection
  private queryBuf = "";

  // Cached render
  private cachedLines: string[] | null = null;
  dirty = true;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.grid = newGrid(cols, rows);
  }

  resize(cols: number, rows: number): void {
    const oldGrid = this.grid;
    const oldRows = this.rows;
    const oldCols = this.cols;

    this.cols = cols;
    this.rows = rows;
    this.grid = newGrid(cols, rows);

    const copyRows = Math.min(oldRows, rows);
    const copyCols = Math.min(oldCols, cols);
    for (let r = 0; r < copyRows; r++) {
      for (let c = 0; c < copyCols; c++) {
        this.grid[r]![c] = oldGrid[r]![c]!;
      }
    }
    this.cursorX = Math.min(this.cursorX, cols - 1);
    this.cursorY = Math.min(this.cursorY, rows - 1);
    this.dirty = true;
  }

  // ── Alternate screen buffer ──

  private enterAltScreen(): void {
    if (this.useAltScreen) return;
    this.useAltScreen = true;
    // Save main screen state
    this.altGrid = this.grid;
    this.altCursorX = this.cursorX;
    this.altCursorY = this.cursorY;
    this.altAttrs = cloneAttrs(this.attrs);
    // Start fresh
    this.grid = newGrid(this.cols, this.rows);
    this.cursorX = 0;
    this.cursorY = 0;
    this.attrs = { ...EMPTY_ATTRS };
    this.dirty = true;
  }

  private leaveAltScreen(): void {
    if (!this.useAltScreen) return;
    this.useAltScreen = false;
    // Restore main screen
    if (this.altGrid) {
      this.grid = this.altGrid;
      this.cursorX = this.altCursorX;
      this.cursorY = this.altCursorY;
      this.attrs = cloneAttrs(this.altAttrs);
      this.altGrid = null;
    }
    this.dirty = true;
  }

  /** Feed raw PTY data. Returns query responses to write back to PTY. */
  write(data: string): string {
    const responses = this.handleQueries(data);
    // Iterate by Unicode code points so CJK / emoji are handled correctly
    for (let i = 0; i < this.queryBuf.length; ) {
      const cp = this.queryBuf.codePointAt(i)!;
      const ch = String.fromCodePoint(cp);
      this.processChar(cp, ch);
      i += cp > 0xffff ? 2 : 1;
    }
    this.queryBuf = "";
    this.dirty = true;
    return responses;
  }

  /** Intercept terminal queries in raw PTY output, return responses. */
  private handleQueries(data: string): string {
    this.queryBuf += data;
    let responses = "";

    // Primary DA: ESC [ c  →  ESC [ ? 1 ; 2 c  (VT100 + AVO)
    // Secondary DA: ESC [ > c  →  ESC [ > 0 ; 0 ; 0 c
    // CPR: ESC [ 6 n  →  ESC [ row ; col R
    // DSR: ESC [ 5 n  →  ESC [ 0 n
    const re = /\x1b\[([?>]?)(\d*(?:;\d+)*)([cn])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.queryBuf)) !== null) {
      const prefix = m[1] || "";
      const paramStr = m[2] || "";
      const finalByte = m[3]!;

      if (finalByte === "c") {
        if (prefix === ">") responses += "\x1b[>0;0;0c";
        else responses += "\x1b[?1;2c";
      } else if (finalByte === "n") {
        const p = parseInt(paramStr, 10) || 0;
        if (p === 6)
          responses += `\x1b[${this.cursorY + 1};${this.cursorX + 1}R`;
        else if (p === 5) responses += "\x1b[0n";
      }
    }

    if (responses) {
      this.queryBuf = this.queryBuf.replace(/\x1b\[[?>]?\d*(?:;\d+)*[cn]/g, "");
    }
    return responses;
  }

  // ---- Parser ----

  private processChar(code: number, ch: string): void {
    if (this.escState === "normal") {
      if (code === 0x1b) {
        this.escState = "esc";
      } else if (code === 0x0d) {
        this.cursorX = 0;
      } // CR
      else if (code === 0x0a) {
        this.lineFeed();
      } // LF
      else if (code === 0x08) {
        if (this.cursorX > 0) this.cursorX--;
      } // BS
      else if (code === 0x09) {
        // TAB
        this.cursorX = Math.min(
          this.cols - 1,
          (Math.floor(this.cursorX / 8) + 1) * 8,
        );
      } else if (code >= 0x20) {
        this.putChar(ch, charWidth(code));
      }
    } else if (this.escState === "esc") {
      if (ch === "[") {
        this.escState = "csi";
        this.csiParams = "";
      } else if (ch === "]") {
        this.escState = "osc";
      } else if (ch === "_" || ch === "P" || ch === "^") {
        this.escState = "osc"; // APC / DCS / PM — swallow until ST
      } else if (ch === "(" || ch === ")" || ch === "*" || ch === "+") {
        // G0/G1/G2/G3 charset select — swallow the next character
        this.escState = "escNext";
      } else {
        this.escState = "normal";
      }
    } else if (this.escState === "csi") {
      if (
        (code >= 0x30 && code <= 0x39) ||
        ch === ";" ||
        ch === "?" ||
        ch === " " ||
        ch === ">"
      ) {
        this.csiParams += ch;
      } else {
        this.handleCSI(ch, this.csiParams);
        this.escState = "normal";
      }
    } else if (this.escState === "osc") {
      // OSC terminated by: BEL (0x07), ESC \ (ST), or single-byte ST (0x9c)
      if (code === 0x07) {
        this.escState = "normal";
      } else if (code === 0x1b) {
        this.escState = "oscEsc"; // wait for \ to complete ST
      } else if (code === 0x9c) {
        this.escState = "normal";
      }
      // else: swallow the character (OSC payload)
    } else if (this.escState === "escNext") {
      // Swallow the charset designator (e.g. 'B' in ESC ( B, '0' in ESC ( 0)
      this.escState = "normal";
    } else if (this.escState === "oscEsc") {
      if (ch === "\\") {
        this.escState = "normal"; // ST completed
      } else {
        this.escState = "osc"; // stray ESC, back to OSC
      }
    }
  }

  private handleCSI(finalByte: string, params: string): void {
    const nums = params
      .replace(/^\?/, "")
      .split(";")
      .map((s) => (s === "" ? 0 : parseInt(s, 10)));

    switch (finalByte) {
      case "m":
        return this.handleSGR(nums);
      case "A":
        this.cursorY = Math.max(0, this.cursorY - (nums[0] || 1));
        break;
      case "B":
        this.cursorY = Math.min(this.rows - 1, this.cursorY + (nums[0] || 1));
        break;
      case "C":
        this.cursorX = Math.min(this.cols - 1, this.cursorX + (nums[0] || 1));
        break;
      case "D":
        this.cursorX = Math.max(0, this.cursorX - (nums[0] || 1));
        break;
      case "H":
      case "f": {
        const row = Math.max(1, nums[0] || 1) - 1;
        const col = Math.max(1, nums[1] || 1) - 1;
        this.cursorY = Math.min(this.rows - 1, row);
        this.cursorX = Math.min(this.cols - 1, col);
        break;
      }
      case "J":
        this.eraseDisplay(nums[0] || 0);
        break;
      case "K":
        this.eraseLine(nums[0] || 0);
        break;
      case "s":
        this.savedX = this.cursorX;
        this.savedY = this.cursorY;
        this.savedAttrs = cloneAttrs(this.attrs);
        break;
      case "u":
        this.cursorX = this.savedX;
        this.cursorY = this.savedY;
        this.attrs = cloneAttrs(this.savedAttrs);
        break;
      case "h":
      case "l":
        // Private modes: alternate screen (1049, 47), cursor visibility (25),
        // bracketed paste (2004), etc.
        if (params.startsWith("?")) {
          const modeNum = nums[0] || 0;
          if (modeNum === 1049 || modeNum === 47) {
            if (finalByte === "h") this.enterAltScreen();
            else this.leaveAltScreen();
          }
        }
        break;
      case "r":
        // Scrolling region — ignore
        break;
    }
  }

  private handleSGR(nums: number[]): void {
    if (nums.length === 0 || (nums.length === 1 && nums[0] === 0)) {
      this.attrs = { ...EMPTY_ATTRS };
      return;
    }
    let i = 0;
    while (i < nums.length) {
      const n = nums[i]!;
      if (n === 0) this.attrs = { ...EMPTY_ATTRS };
      else if (n === 1) this.attrs.bold = true;
      else if (n === 2) this.attrs.dim = true;
      else if (n === 3) this.attrs.italic = true;
      else if (n === 4) this.attrs.underline = true;
      else if (n === 7) this.attrs.reverse = true;
      else if (n >= 30 && n <= 37) this.attrs.fg = n - 30;
      else if (n >= 40 && n <= 47) this.attrs.bg = n - 40;
      else if (n >= 90 && n <= 97) this.attrs.fg = n - 90 + 8;
      else if (n >= 100 && n <= 107) this.attrs.bg = n - 100 + 8;
      else if (n === 38 && i + 2 < nums.length && nums[i + 1] === 5) {
        this.attrs.fg = nums[i + 2]!;
        i += 2;
      } else if (n === 48 && i + 2 < nums.length && nums[i + 1] === 5) {
        this.attrs.bg = nums[i + 2]!;
        i += 2;
      } else if (n === 38 && i + 4 < nums.length && nums[i + 1] === 2) {
        // True colour foreground: 38;2;R;G;B → nearest 256-colour
        this.attrs.fg = rgbTo256(nums[i + 2]!, nums[i + 3]!, nums[i + 4]!);
        i += 4;
      } else if (n === 48 && i + 4 < nums.length && nums[i + 1] === 2) {
        // True colour background: 48;2;R;G;B
        this.attrs.bg = rgbTo256(nums[i + 2]!, nums[i + 3]!, nums[i + 4]!);
        i += 4;
      } else if (n === 39) this.attrs.fg = undefined;
      else if (n === 49) this.attrs.bg = undefined;
      else if (n === 22) {
        this.attrs.bold = false;
        this.attrs.dim = false;
      } else if (n === 23) this.attrs.italic = false;
      else if (n === 24) this.attrs.underline = false;
      else if (n === 27) this.attrs.reverse = false;
      i++;
    }
  }

  private eraseDisplay(n: number): void {
    if (n === 0) {
      for (let r = this.cursorY; r < this.rows; r++) {
        const start = r === this.cursorY ? this.cursorX : 0;
        for (let c = start; c < this.cols; c++)
          this.grid[r]![c] = { char: " ", attrs: { ...EMPTY_ATTRS } };
      }
    } else if (n === 1) {
      for (let r = 0; r <= this.cursorY; r++) {
        const end = r === this.cursorY ? this.cursorX : this.cols - 1;
        for (let c = 0; c <= end; c++)
          this.grid[r]![c] = { char: " ", attrs: { ...EMPTY_ATTRS } };
      }
    } else if (n === 2 || n === 3) {
      this.grid = newGrid(this.cols, this.rows);
      this.cursorX = 0;
      this.cursorY = 0;
    }
  }

  private eraseLine(n: number): void {
    if (n === 0) {
      for (let c = this.cursorX; c < this.cols; c++)
        this.grid[this.cursorY]![c] = { char: " ", attrs: { ...EMPTY_ATTRS } };
    } else if (n === 1) {
      for (let c = 0; c <= this.cursorX; c++)
        this.grid[this.cursorY]![c] = { char: " ", attrs: { ...EMPTY_ATTRS } };
    } else if (n === 2) {
      for (let c = 0; c < this.cols; c++)
        this.grid[this.cursorY]![c] = { char: " ", attrs: { ...EMPTY_ATTRS } };
    }
  }

  private putChar(ch: string, width: number = 1): void {
    // If the character won't fit on the current line, wrap
    if (this.cursorX + width > this.cols) {
      this.cursorX = 0;
      this.lineFeed();
    }

    this.grid[this.cursorY]![this.cursorX] = {
      char: ch,
      attrs: cloneAttrs(this.attrs),
    };

    // Wide chars (CJK / emoji) occupy 2 terminal columns.
    // Mark the second cell as a phantom continuation.
    if (width === 2 && this.cursorX + 1 < this.cols) {
      this.grid[this.cursorY]![this.cursorX + 1] = {
        char: "",
        attrs: cloneAttrs(this.attrs),
      };
    }
    this.cursorX += width;
  }

  private lineFeed(): void {
    if (this.cursorY < this.rows - 1) {
      this.cursorY++;
    } else {
      for (let r = 0; r < this.rows - 1; r++) this.grid[r] = this.grid[r + 1]!;
      this.grid[this.rows - 1] = new Array(this.cols)
        .fill(null)
        .map(() => ({ char: " ", attrs: { ...EMPTY_ATTRS } as CellAttrs }));
    }
  }

  // ---- Render ----

  render(): string[] {
    if (!this.dirty && this.cachedLines) return this.cachedLines;

    const bgReset = "\x1b[0;40m"; // reset + black background

    const lines: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      const row = this.grid[r]!;
      // Every line starts with reset + black backdrop so reverse-video
      // (\x1b[7m) always swaps against a known dark background.
      let line = bgReset;
      let lastAttrs: CellAttrs = { bg: 0 };

      for (let c = 0; c < this.cols; c++) {
        const cell = row[c]!;
        // Skip phantom cells (second column of a CJK/wide character)
        if (cell.char === "") continue;
        if (attrsEqual(cell.attrs, lastAttrs)) {
          line += cell.char;
        } else {
          line += cellToSGR(cell);
          lastAttrs = cell.attrs;
        }
      }
      // Reset at end of line
      line += "\x1b[0m";
      // Strip trailing whitespace but keep the reset
      lines.push(line.replace(/(\s+)(\x1b\[0m)$/, "$2"));
    }

    this.cachedLines = lines;
    this.dirty = false;
    return lines;
  }
}

function newGrid(cols: number, rows: number): Cell[][] {
  const g: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      row.push({ char: " ", attrs: { ...EMPTY_ATTRS } });
    }
    g.push(row);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Overlay Component
// ---------------------------------------------------------------------------

const BORDER_COLOUR = "\x1b[38;5;133m"; // mauve/purple border
const BORDER_RESET = "\x1b[0m";

class FloatTermOverlay {
  private term: TermBuffer;
  private ptyProcess: IPty;
  private done: (v: null) => void;
  private tui: any;
  private closed = false;
  private innerRows: number;
  private innerCols: number;

  constructor(
    shellCmd: string,
    shellArgs: string[],
    cols: number,
    rows: number,
    tui: any,
    done: (v: null) => void,
  ) {
    this.tui = tui;
    this.done = done;
    this.innerCols = cols;
    this.innerRows = rows;
    this.term = new TermBuffer(cols, rows);

    this.ptyProcess = ptySpawn(shellCmd, shellArgs, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    this.ptyProcess.onData((data: string) => {
      if (this.closed) return;
      const responses = this.term.write(data);
      if (responses) this.ptyProcess.write(responses);
      this.tui.requestRender();
    });

    this.ptyProcess.onExit(() => {
      this.closed = true;
      done(null);
    });
  }

  handleInput(data: string): void {
    if (this.closed) return;

    // Ctrl+Space: force close (like Neovim's floating terminal)
    if (matchesKey(data, Key.ctrl(" ")) || matchesKey(data, "ctrl+space")) {
      this.close();
      return;
    }

    // Forward all other input to PTY
    this.ptyProcess.write(data);
  }

  render(width: number): string[] {
    if (this.closed) return [];

    const termLines = this.term.render();
    const lines: string[] = [];

    // ── Top border ──
    const topBar = "╭" + "─".repeat(this.innerCols) + "╮";
    lines.push(padAnsi(BORDER_COLOUR + topBar + BORDER_RESET, width));

    // ── Terminal content ──
    for (const raw of termLines) {
      const content = truncateToWidth(raw, this.innerCols);
      const vis = visibleWidth(content);
      const padded =
        vis < this.innerCols
          ? content + " ".repeat(this.innerCols - vis)
          : content;
      lines.push(
        padAnsi(
          BORDER_COLOUR +
            "│" +
            BORDER_RESET +
            padded +
            BORDER_COLOUR +
            "│" +
            BORDER_RESET,
          width,
        ),
      );
    }

    // ── Bottom border with hint ──
    const hint = " Ctrl+Space: close | exit / Ctrl+D: quit shell ";
    const hintLen = visibleWidth(hint);
    const barLen = this.innerCols;
    if (hintLen <= barLen) {
      const leftPad = Math.floor((barLen - hintLen) / 2);
      const rightPad = barLen - hintLen - leftPad;
      const bottomBar =
        "╰" + "─".repeat(leftPad) + hint + "─".repeat(rightPad) + "╯";
      lines.push(padAnsi(BORDER_COLOUR + bottomBar + BORDER_RESET, width));
    } else {
      const bottomBar = "╰" + "─".repeat(barLen) + "╯";
      lines.push(padAnsi(BORDER_COLOUR + bottomBar + BORDER_RESET, width));
    }

    return lines;
  }

  invalidate(): void {}

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ptyProcess.kill();
    } catch (_) {
      /* ignore */
    }
    this.done(null);
  }

  resize(cols: number, rows: number): void {
    this.innerCols = cols;
    this.innerRows = rows;
    this.term.resize(cols, rows);
    try {
      this.ptyProcess.resize(cols, rows);
    } catch (_) {
      /* ignore */
    }
  }
}

/** Pad an ANSI-styled string to exact visible width. */
function padAnsi(styled: string, width: number): string {
  const vis = visibleWidth(styled);
  if (vis >= width) return truncateToWidth(styled, width);
  return styled + " ".repeat(width - vis);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function openFloatTerm(ctx: any, shellCmd: string, shellArgs: string[]) {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("浮动终端需要 TUI 模式", "warning");
    return;
  }

  // Terminal height captured from overlay visible callback.
  let termHeight = 40;

  await ctx.ui.custom<null>(
    (tui: any, _theme: any, _kb: any, done: any) => {
      let overlay: FloatTermOverlay | null = null;
      let lastWidth = 0;

      const wrapper = {
        render(width: number): string[] {
          const innerCols = Math.max(20, width - 2);
          const maxContentRows = Math.max(4, Math.floor(termHeight * 0.75) - 2);
          const rows = Math.min(
            Math.max(4, Math.floor(innerCols * 0.45)),
            maxContentRows,
          );

          if (!overlay) {
            overlay = new FloatTermOverlay(
              shellCmd,
              shellArgs,
              innerCols,
              rows,
              tui,
              done,
            );
            lastWidth = width;
          } else if (width !== lastWidth) {
            overlay.resize(innerCols, rows);
            lastWidth = width;
          }
          return overlay!.render(width);
        },
        invalidate(): void {},
        handleInput(data: string): void {
          if (overlay) {
            overlay.handleInput(data);
          } else if (
            matchesKey(data, Key.escape) ||
            matchesKey(data, Key.ctrl("c"))
          ) {
            done(null);
          }
        },
      };
      return wrapper;
    },
    {
      overlay: true,
      overlayOptions: {
        width: "85%",
        maxHeight: "75%",
        anchor: "center",
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
        // Capture terminal height on each render cycle so we can fit content
        visible: (_tw: number, th: number) => {
          termHeight = th;
          return true;
        },
      },
    },
  );
}

export default function (pi: ExtensionAPI) {
  const STATUS_KEY = "float-term";

  // Show shortcut hints in pi's footer
  function refreshStatus(ctx: any) {
    if (!ctx.hasUI) return;
    const t = ctx.ui.theme;
    const hint = [
      t.fg("accent", "C-a-f") + t.fg("dim", ":fish"),
      t.fg("accent", "C-a-y") + t.fg("dim", ":yazi"),
      t.fg("accent", "C-S-a-g") + t.fg("dim", ":gcp"),
      t.fg("accent", "C-a-g") + t.fg("dim", ":lazygit"),
    ].join("  ");
    ctx.ui.setStatus(STATUS_KEY, hint);
  }

  pi.on("session_start", async (_e, ctx) => {
    refreshStatus(ctx);
  });

  // ── Shortcuts ──

  pi.registerShortcut("ctrl+alt+f", {
    description: "浮动终端: fish",
    handler: async (ctx: any) => {
      await openFloatTerm(ctx, "fish", []);
    },
  });

  pi.registerShortcut("ctrl+alt+g", {
    description: "浮动终端: lazygit",
    handler: async (ctx: any) => {
      await openFloatTerm(ctx, "lazygit", []);
    },
  });

  pi.registerShortcut("ctrl+alt+y", {
    description: "浮动终端: yazi",
    handler: async (ctx: any) => {
      await openFloatTerm(ctx, "yazi", []);
    },
  });

  pi.registerShortcut("ctrl+shift+alt+g", {
    description: "浮动终端: gcp (git conventional commits)",
    handler: async (ctx: any) => {
      await openFloatTerm(ctx, "fish", ["-c", "gcp; exec fish"]);
    },
  });

  // ── Commands ──

  pi.registerCommand("float-fish", {
    description: "打开浮动终端 (fish)",
    handler: async (_args: any, ctx: any) => {
      await openFloatTerm(ctx, "fish", []);
    },
  });

  pi.registerCommand("float-lazygit", {
    description: "打开浮动终端 (lazygit)",
    handler: async (_args: any, ctx: any) => {
      await openFloatTerm(ctx, "lazygit", []);
    },
  });

  pi.registerCommand("float-yazi", {
    description: "打开浮动终端 (yazi)",
    handler: async (_args: any, ctx: any) => {
      await openFloatTerm(ctx, "yazi", []);
    },
  });
}
