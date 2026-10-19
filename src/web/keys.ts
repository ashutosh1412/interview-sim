// Keyboard handling that works the same on macOS, Windows and Linux, in any browser
// and with any keyboard layout or input method.

/** The fields of a keyboard event we read; lets the logic be tested without a DOM. */
export interface KeyLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

/**
 * True while an input method (Chinese, Japanese, Korean...) is composing text. Enter then
 * confirms the characters and must not submit the form. Safari reports the confirming
 * Enter with keyCode 229 instead of isComposing.
 */
export function isComposing(e: KeyLike): boolean {
  return e.isComposing === true || e.keyCode === 229;
}

/**
 * The letter of a shortcut key. Uses the typed character when it is a Latin letter, so
 * AZERTY/QWERTZ users press the key labelled Z; falls back to the physical key for
 * layouts that type other scripts (Cyrillic, Greek, Arabic...).
 */
export function shortcutLetter(e: KeyLike): string {
  const typed = e.key.toLowerCase();
  if (/^[a-z]$/.test(typed)) return typed;
  return /^Key([A-Z])$/.exec(e.code)?.[1]?.toLowerCase() ?? typed;
}

export type ShortcutAction = "undo" | "redo" | "copy" | "paste" | "duplicate" | "selectAll" | "toFront" | "toBack";

/**
 * Maps a key press to a canvas action. Cmd (Mac) and Ctrl (everywhere) both count.
 * Presses that include Alt are ignored, because on Windows AltGr arrives as Ctrl+Alt and
 * is used to type characters on many European layouts.
 */
export function matchShortcut(e: KeyLike): ShortcutAction | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || isComposing(e)) return null;
  // Arrow alternatives for layering: browsers don't reserve these (Ctrl/Cmd+Shift+B is
  // "bookmarks bar" in Chrome, Firefox and Safari).
  if (e.shiftKey && e.key === "ArrowUp") return "toFront";
  if (e.shiftKey && e.key === "ArrowDown") return "toBack";
  switch (shortcutLetter(e)) {
    case "z":
      return e.shiftKey ? "redo" : "undo";
    case "y":
      return e.shiftKey ? null : "redo";
    case "c":
      return e.shiftKey ? null : "copy";
    case "v":
      return e.shiftKey ? null : "paste";
    case "d":
      return e.shiftKey ? null : "duplicate";
    case "a":
      return e.shiftKey ? null : "selectAll";
    case "f":
      return e.shiftKey ? "toFront" : null;
    case "b":
      return e.shiftKey ? "toBack" : null;
    default:
      return null;
  }
}

type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

/** Apple keyboards use Cmd; everything else uses Ctrl. Only affects the labels we show. */
export const isApplePlatform =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test((navigator as NavigatorWithUAData).userAgentData?.platform ?? navigator.platform ?? "");
