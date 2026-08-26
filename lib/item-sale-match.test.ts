import { describe, expect, it } from "vitest";
import {
  buildItemIndex,
  buildSalePriceIndex,
  matchItemForShoeId,
  parseShoeId,
  type MatchableItem,
  type SaleForPriceMatch,
} from "./item-sale-match";

function makeItem(overrides: Partial<MatchableItem>): MatchableItem {
  return {
    internalNumber: 1,
    legacyNumber: null,
    batchLabel: null,
    brand: null,
    size: null,
    price: null,
    ...overrides,
  };
}

describe("parseShoeId", () => {
  it("splits a lettered prefix from its trailing number", () => {
    expect(parseShoeId("R15950")).toEqual({ prefix: "R", internalNumber: 15950 });
  });

  it("handles a pure-digit id with an empty prefix", () => {
    expect(parseShoeId("8008")).toEqual({ prefix: "", internalNumber: 8008 });
  });

  it("returns null for an unparsable id", () => {
    expect(parseShoeId("not-a-number")).toBeNull();
  });

  it("returns null for a missing id", () => {
    expect(parseShoeId(null)).toBeNull();
    expect(parseShoeId(undefined)).toBeNull();
  });
});

describe("matchItemForShoeId", () => {
  it("matches by exact legacy number", () => {
    const items = [makeItem({ legacyNumber: "R15950" })];
    const index = buildItemIndex(items);
    expect(matchItemForShoeId("R15950", index)).toBe(items[0]);
  });

  it("falls back to batch label + internal number when there's no legacy number", () => {
    const items = [makeItem({ legacyNumber: null, batchLabel: "R", internalNumber: 42 })];
    const index = buildItemIndex(items);
    expect(matchItemForShoeId("R42", index)).toBe(items[0]);
  });

  // Modeled on the exact real-world case this session corrected: the same
  // legacy number reused for a second, different physical pair must never
  // be resolved by guessing — it has to come back empty so callers skip it.
  it("refuses to guess when the same key matches more than one item", () => {
    const items = [
      makeItem({ legacyNumber: "R15615" }),
      makeItem({ legacyNumber: "R15615", internalNumber: 2 }),
    ];
    const index = buildItemIndex(items);
    expect(matchItemForShoeId("R15615", index)).toBeNull();
  });

  it("checks every part of a comma-joined multi-pair shoe id", () => {
    const items = [makeItem({ legacyNumber: "Q1" }), makeItem({ legacyNumber: "R1", internalNumber: 2 })];
    const index = buildItemIndex(items);
    expect(matchItemForShoeId("Q1, R1", index)).toBe(items[0]);
  });

  it("returns null for an id with no match at all", () => {
    const index = buildItemIndex([makeItem({ legacyNumber: "R1" })]);
    expect(matchItemForShoeId("Z999", index)).toBeNull();
  });
});

describe("buildSalePriceIndex", () => {
  function makeSale(overrides: Partial<SaleForPriceMatch>): SaleForPriceMatch {
    return { legacy_shoe_id: null, sale_price: null, items: null, ...overrides };
  }

  it("prefers a manually-resolved itemId from a multi-pair sale's items[]", () => {
    const index = buildSalePriceIndex([
      makeSale({ sale_price: 250, items: [{ shoeId: "R1", price: 250, cost: 100, itemId: "item-1" }] }),
    ]);
    expect(index.byItemId.get("item-1")).toBe(250);
  });

  it("resolves a single-pair sale's legacy number when it's unambiguous", () => {
    const index = buildSalePriceIndex([makeSale({ legacy_shoe_id: "R15950", sale_price: 300 })]);
    expect(index.byLegacyNumber.get("R15950")).toBe(300);
  });

  it("skips a legacy number that appears in more than one single-pair sale rather than guessing", () => {
    const index = buildSalePriceIndex([
      makeSale({ legacy_shoe_id: "R15950", sale_price: 300 }),
      makeSale({ legacy_shoe_id: "R15950", sale_price: 250 }),
    ]);
    expect(index.byLegacyNumber.has("R15950")).toBe(false);
  });

  it("does not fall back to legacy number matching for a multi-pair sale with no itemId", () => {
    const index = buildSalePriceIndex([
      makeSale({ legacy_shoe_id: "Q1, R1", sale_price: 400, items: [{ shoeId: "Q1", price: 200, cost: 80 }, { shoeId: "R1", price: 200, cost: 80 }] }),
    ]);
    expect(index.byLegacyNumber.size).toBe(0);
    expect(index.byItemId.size).toBe(0);
  });

  it("ignores a sale with no sale_price", () => {
    const index = buildSalePriceIndex([makeSale({ legacy_shoe_id: "R1", sale_price: null })]);
    expect(index.byLegacyNumber.has("R1")).toBe(false);
  });
});
