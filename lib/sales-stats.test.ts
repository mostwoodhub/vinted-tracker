import { describe, expect, it } from "vitest";
import type { MatchableItem } from "./item-sale-match";
import { computeDiscountStats } from "./sales-stats";
import type { SaleRow } from "@/lib/sales-types";

type DiscountSale = Pick<SaleRow, "quantity" | "items" | "sale_price" | "legacy_shoe_id">;

function makeSale(overrides: Partial<DiscountSale>): DiscountSale {
  return { quantity: 1, items: null, sale_price: null, legacy_shoe_id: null, ...overrides };
}

function makeItem(overrides: Partial<MatchableItem>): MatchableItem {
  return { internalNumber: 1, legacyNumber: null, batchLabel: null, brand: null, size: null, price: null, ...overrides };
}

describe("computeDiscountStats", () => {
  it("counts a sale at or above asking price as full price, not discounted", () => {
    const items = [makeItem({ legacyNumber: "R1", price: 100 })];
    const sales = [makeSale({ legacy_shoe_id: "R1", sale_price: 100 })];
    const stats = computeDiscountStats(sales, items);
    expect(stats.matchedCount).toBe(1);
    expect(stats.fullPriceCount).toBe(1);
    expect(stats.discountedCount).toBe(0);
  });

  it("counts a sale below asking price as discounted and computes the average % correctly", () => {
    const items = [makeItem({ legacyNumber: "R1", price: 100 })];
    // Sold for 75, i.e. 25% below the 100 zł asking price.
    const sales = [makeSale({ legacy_shoe_id: "R1", sale_price: 75 })];
    const stats = computeDiscountStats(sales, items);
    expect(stats.discountedCount).toBe(1);
    expect(stats.averageDiscountPercent).toBeCloseTo(25, 5);
    expect(stats.averageDiscountAmount).toBe(25);
  });

  it("averages the discount % across multiple discounted sales", () => {
    const items = [
      makeItem({ legacyNumber: "R1", price: 100 }),
      makeItem({ legacyNumber: "R2", price: 200 }),
    ];
    const sales = [
      makeSale({ legacy_shoe_id: "R1", sale_price: 80 }), // 20% off
      makeSale({ legacy_shoe_id: "R2", sale_price: 100 }), // 50% off
    ];
    const stats = computeDiscountStats(sales, items);
    expect(stats.discountedCount).toBe(2);
    expect(stats.averageDiscountPercent).toBeCloseTo(35, 5);
  });

  it("skips a sale with quantity > 1 — a single asking price can't be compared to a multi-pair total", () => {
    const items = [makeItem({ legacyNumber: "R1", price: 100 })];
    const sales = [makeSale({ legacy_shoe_id: "R1", sale_price: 50, quantity: 2 })];
    const stats = computeDiscountStats(sales, items);
    expect(stats.matchedCount).toBe(0);
  });

  it("skips a sale whose items[] breakdown has more than one line", () => {
    const items = [makeItem({ legacyNumber: "R1", price: 100 })];
    const sales = [
      makeSale({
        legacy_shoe_id: "R1",
        sale_price: 50,
        items: [
          { shoeId: "R1", price: 25, cost: 10 },
          { shoeId: "Q1", price: 25, cost: 10 },
        ],
      }),
    ];
    const stats = computeDiscountStats(sales, items);
    expect(stats.matchedCount).toBe(0);
  });

  it("skips a sale that doesn't match any item", () => {
    const sales = [makeSale({ legacy_shoe_id: "R999", sale_price: 50 })];
    const stats = computeDiscountStats(sales, []);
    expect(stats.matchedCount).toBe(0);
  });

  it("skips a matched item with no asking price set", () => {
    const items = [makeItem({ legacyNumber: "R1", price: null })];
    const sales = [makeSale({ legacy_shoe_id: "R1", sale_price: 50 })];
    const stats = computeDiscountStats(sales, items);
    expect(stats.matchedCount).toBe(0);
  });

  it("returns 0% (not NaN) when there are no discounted sales at all", () => {
    const items = [makeItem({ legacyNumber: "R1", price: 100 })];
    const sales = [makeSale({ legacy_shoe_id: "R1", sale_price: 100 })];
    const stats = computeDiscountStats(sales, items);
    expect(stats.averageDiscountPercent).toBe(0);
    expect(stats.averageDiscountAmount).toBe(0);
  });
});
