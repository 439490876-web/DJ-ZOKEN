/* @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SegmentedControl } from "../components/SegmentedControl";

describe("SegmentedControl", () => {
  it("renders active option", () => {
    render(<SegmentedControl options={[{ id: "a", label: "A" }]} value="a" onChange={() => {}} />);
    expect(screen.getByText("A").className).toContain("is-active");
  });
});
