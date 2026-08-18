/**
 * Bar Cursor — replaces the default block (reverse-video) cursor with a
 * vertical bar using the terminal's native hardware cursor shape.
 *
 * Install:
 *   pi install npm:@joyanhui/pi-ext-bar-cursor
 *
 * How it works:
 * 1. Sends DECSCUSR `\x1b[6 q` to tell the terminal "use a steady vertical bar".
 * 2. Strips the editor's fake block cursor (\x1b[7m…\x1b[0m) so the hardware
 *    bar cursor shows through unobstructed, without shifting any text.
 *
 * Width is preserved exactly — no text movement, no crashes.
 */

import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER } from "@earendil-works/pi-tui";

const REVERSE_ON = "\x1b[7m";
const REVERSE_OFF = ["\x1b[0m", "\x1b[27m"];

/** Set terminal hardware cursor to a steady vertical bar (DECSCUSR). */
const BAR_CURSOR = "\x1b[6 q";

/** Strip the fake block cursor (reverse-video) so the hardware bar cursor
 *  is visible.  The CURSOR_MARKER is preserved — that's what pi uses to
 *  position the hardware terminal cursor for IME candidate-window placement.
 *
 *  Width is unchanged: the original reversed char (W cells) is replaced by
 *  the same char without reverse video, still W cells.  No width change = no
 *  crashes, no text shifting. */
function stripBlockCursor(line: string): string {
  const markerIdx = line.indexOf(CURSOR_MARKER);
  if (markerIdx === -1) return line;

  const afterMarker = line.substring(markerIdx + CURSOR_MARKER.length);
  if (!afterMarker.startsWith(REVERSE_ON)) return line;

  const contentStart = markerIdx + CURSOR_MARKER.length + REVERSE_ON.length;
  const reverseOff = REVERSE_OFF
    .map((sequence) => ({ sequence, index: line.indexOf(sequence, contentStart) }))
    .filter(({ index }) => index !== -1)
    .sort((a, b) => a.index - b.index)[0];
  if (!reverseOff) return line;

  const cursorChar = line.substring(contentStart, reverseOff.index);
  const before = line.substring(0, markerIdx);
  const after = line.substring(reverseOff.index + reverseOff.sequence.length);

  // Just skip the escape codes — character appears normally, width unchanged.
  return before + CURSOR_MARKER + cursorChar + after;
}

class BarCursorEditor extends CustomEditor {
  render(width: number): string[] {
    const lines = super.render(width);
    return lines.map(stripBlockCursor);
  }
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------
export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    // Tell the terminal to use a steady vertical bar for the hardware cursor.
    process.stdout.write(BAR_CURSOR);

    ctx.ui.setEditorComponent(
      (tui, editorTheme, kb) => {
        // Pi hides the terminal cursor by default, even when a cursor marker exists.
        tui.setShowHardwareCursor(true);
        return new BarCursorEditor(tui, editorTheme, kb);
      },
    );
  });
}
