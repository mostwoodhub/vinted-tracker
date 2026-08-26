import { describe, expect, it } from "vitest";
import { suggestCostPrice } from "./batch-cost-rules";

describe("suggestCostPrice", () => {
  it("returns null when batch label is missing", () => {
    expect(suggestCostPrice(null, 150)).toBeNull();
  });

  it("returns null when price is missing", () => {
    expect(suggestCostPrice("A", null)).toBeNull();
  });

  it("returns null for a batch with no known rule", () => {
    expect(suggestCostPrice("Z", 150)).toBeNull();
  });

  describe("tiered batches (A, D, J, M, R)", () => {
    it.each(["A", "D", "J", "M", "R"])("prices %s at the low tier at exactly 100", (label) => {
      expect(suggestCostPrice(label, 100)).toBe(45);
    });

    it("prices just above the low tier at the mid tier", () => {
      expect(suggestCostPrice("A", 101)).toBe(80);
    });

    it("prices at exactly 200 at the mid tier", () => {
      expect(suggestCostPrice("A", 200)).toBe(80);
    });

    it("prices just above the mid tier at the high tier", () => {
      expect(suggestCostPrice("A", 201)).toBe(120);
    });

    it("prices well above 200 at the high tier", () => {
      expect(suggestCostPrice("R", 999)).toBe(120);
    });
  });

  describe("flat-cost batches", () => {
    const flatCosts: Record<string, number> = {
      B: 110,
      C: 120,
      E: 150,
      F: 55,
      G: 135,
      H: 170,
      I: 135,
      K: 110,
      L: 170,
      N: 130,
      O: 65,
    };

    for (const [label, cost] of Object.entries(flatCosts)) {
      it(`prices batch ${label} at a flat ${cost} zł regardless of price`, () => {
        expect(suggestCostPrice(label, 50)).toBe(cost);
        expect(suggestCostPrice(label, 5000)).toBe(cost);
      });
    }
  });
});
