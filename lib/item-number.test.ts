import { describe, expect, it } from "vitest";
import { formatItemNumber } from "./item-number";

describe("formatItemNumber", () => {
  it("prefers the legacy number when present", () => {
    expect(formatItemNumber("R", 42, "R15950")).toBe("R15950");
  });

  it("falls back to batch label + internal number when there's no legacy number", () => {
    expect(formatItemNumber("R", 42, null)).toBe("R42");
  });

  it("falls back to just the internal number when there's neither a legacy number nor a batch", () => {
    expect(formatItemNumber(null, 42, null)).toBe("42");
  });

  it("treats a whitespace-only legacy number as absent", () => {
    expect(formatItemNumber("R", 42, "   ")).toBe("R42");
  });

  it("accepts a string internal number", () => {
    expect(formatItemNumber("R", "42", null)).toBe("R42");
  });
});
