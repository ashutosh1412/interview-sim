import { describe, expect, it } from "vitest";
import { isComposing, matchShortcut, shortcutLetter, type KeyLike } from "../src/web/keys.ts";
import { shortcut } from "../src/web/components/ContextMenu.tsx";

const press = (over: Partial<KeyLike>): KeyLike => ({
  key: "", code: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over,
});
const mac = (key: string, code: string, shift = false) => press({ key, code, metaKey: true, shiftKey: shift });
const pc = (key: string, code: string, shift = false) => press({ key, code, ctrlKey: true, shiftKey: shift });

describe("shortcuts work the same on Mac (Cmd) and Windows/Linux (Ctrl)", () => {
  it.each([
    ["z", "KeyZ", false, "undo"],
    ["z", "KeyZ", true, "redo"],
    ["y", "KeyY", false, "redo"],
    ["c", "KeyC", false, "copy"],
    ["v", "KeyV", false, "paste"],
    ["d", "KeyD", false, "duplicate"],
    ["a", "KeyA", false, "selectAll"],
    ["F", "KeyF", true, "toFront"],
    ["B", "KeyB", true, "toBack"],
    ["ArrowUp", "ArrowUp", true, "toFront"],
    ["ArrowDown", "ArrowDown", true, "toBack"],
  ] as const)("%s (shift=%s) -> %s", (key, code, shift, action) => {
    expect(matchShortcut(mac(key, code, shift))).toBe(action);
    expect(matchShortcut(pc(key, code, shift))).toBe(action);
  });

  it("ignores plain keys and unknown combinations", () => {
    expect(matchShortcut(press({ key: "z", code: "KeyZ" }))).toBeNull();
    expect(matchShortcut(pc("f", "KeyF"))).toBeNull(); // Ctrl+F stays the browser's find
    expect(matchShortcut(pc("ArrowUp", "ArrowUp"))).toBeNull();
  });
});

describe("keyboard layouts and input methods", () => {
  it("uses the physical key when the layout types another script (Russian Ctrl+Z types 'я')", () => {
    expect(shortcutLetter(pc("я", "KeyZ"))).toBe("z");
    expect(matchShortcut(pc("я", "KeyZ"))).toBe("undo");
  });

  it("follows the label on Latin layouts (AZERTY: the key labelled Z sits at code KeyW)", () => {
    expect(matchShortcut(pc("z", "KeyW"))).toBe("undo");
  });

  it("ignores AltGr (Ctrl+Alt) so European characters can still be typed", () => {
    expect(matchShortcut(press({ key: "z", code: "KeyZ", ctrlKey: true, altKey: true }))).toBeNull();
  });

  it("detects IME composition, including Safari's keyCode 229", () => {
    expect(isComposing(press({ key: "Enter", isComposing: true }))).toBe(true);
    expect(isComposing(press({ key: "Enter", keyCode: 229 }))).toBe(true);
    expect(isComposing(press({ key: "Enter", keyCode: 13 }))).toBe(false);
    expect(matchShortcut(press({ key: "z", code: "KeyZ", ctrlKey: true, isComposing: true }))).toBeNull();
  });
});

describe("labels", () => {
  it("shows arrow alternatives on both platforms", () => {
    expect(shortcut("mod+shift+up", true)).toBe("⇧⌘↑");
    expect(shortcut("mod+shift+down", false)).toBe("Ctrl+Shift+↓");
  });
});

describe("request ids outside secure contexts", () => {
  it("falls back when crypto.randomUUID is missing (http on a LAN IP)", async () => {
    const { newRequestId } = await import("../src/web/api.ts");
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const id = newRequestId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(newRequestId()).not.toBe(id);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
