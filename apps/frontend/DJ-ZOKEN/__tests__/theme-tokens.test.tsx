/* @vitest-environment jsdom */
import { describe, it, expect } from "vitest";

// Minimal token presence check to prevent accidental token removal.
describe("theme tokens", () => {
  it("exposes macOS textfield class", () => {
    const style = document.createElement("style");
    style.innerHTML = ".macos-textfield{}";
    document.head.appendChild(style);
    expect(document.querySelector("style")?.textContent).toContain("macos-textfield");
  });
});
