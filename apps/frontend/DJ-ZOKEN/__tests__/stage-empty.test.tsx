/* @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("Stage empty state", () => {
  it("renders Current Set empty prompt", async () => {
    render(<App />);
    expect(await screen.findByText(/Current Set/)).toBeTruthy();
  });
});
