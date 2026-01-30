/* @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import App from "../App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      if (typeof input === "string" && input.startsWith("/api/setlists")) {
        return {
          ok: true,
          json: async () => ({ ok: true, setlists: [] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Sidebar dropzone", () => {
  it("renders dropzone hint", async () => {
    render(<App />);
    expect(await screen.findByText("拖拽本地歌曲到这里")).toBeTruthy();
  });
});
