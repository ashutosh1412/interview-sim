import { describe, expect, it } from "vitest";
import { shortcut } from "../src/web/components/ContextMenu.tsx";

describe("shortcut labels", () => {
  it("uses Mac symbols in macOS order", () => {
    expect(shortcut("mod+shift+f", true)).toBe("⇧⌘F");
    expect(shortcut("mod+d", true)).toBe("⌘D");
    expect(shortcut("backspace", true)).toBe("⌫");
  });

  it("uses Ctrl words elsewhere", () => {
    expect(shortcut("mod+shift+f", false)).toBe("Ctrl+Shift+F");
    expect(shortcut("mod+d", false)).toBe("Ctrl+D");
    expect(shortcut("backspace", false)).toBe("Del");
  });
});
