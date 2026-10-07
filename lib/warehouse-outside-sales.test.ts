import { describe, expect, it } from "vitest";
import { findSalesOutsideWarehouse, type SaleForOutsideCheck } from "./warehouse-outside-sales";

function sale(over: Partial<SaleForOutsideCheck>): SaleForOutsideCheck {
  return {
    id: "s", legacy_shoe_id: null, sale_price: 100, sale_date: "2026-01-01", buyer_name: null,
    account_name: "A", photo_url: null, photo_urls: null, items: null, ...over,
  };
}

describe("findSalesOutsideWarehouse", () => {
  const labels = ["R", "P"];

  it("lists a sale with no warehouse item at all", () => {
    const out = findSalesOutsideWarehouse([sale({ id: "1", legacy_shoe_id: "R15699" })], [], labels);
    expect(out.map((o) => o.number)).toEqual(["R15699"]);
    expect(out[0].batchLabel).toBe("R");
  });

  it("does not list a sale covered by a sold warehouse item", () => {
    const out = findSalesOutsideWarehouse(
      [sale({ id: "1", legacy_shoe_id: "R15699" })],
      [{ legacy_number: "R15699", status: "sold" }],
      labels
    );
    expect(out).toEqual([]);
  });

  it("lists the sale when the warehouse item with that number is NOT sold (reused number)", () => {
    const out = findSalesOutsideWarehouse(
      [sale({ id: "1", legacy_shoe_id: "R15699" })],
      [{ legacy_number: "R15699", status: "received" }],
      labels
    );
    expect(out).toHaveLength(1);
  });

  it("with a number sold 3 times and one sold item, keeps the 2 older sales as outside", () => {
    const sales = [
      sale({ id: "old", legacy_shoe_id: "P1", sale_date: "2025-01-01" }),
      sale({ id: "mid", legacy_shoe_id: "P1", sale_date: "2025-06-01" }),
      sale({ id: "new", legacy_shoe_id: "P1", sale_date: "2026-03-01" }),
    ];
    const out = findSalesOutsideWarehouse(sales, [{ legacy_number: "P1", status: "sold" }], labels);
    expect(out.map((o) => o.saleId).sort()).toEqual(["mid", "old"]);
  });

  it("ignores numbers without a known batch letter, and the Archiwum account", () => {
    const out = findSalesOutsideWarehouse(
      [
        sale({ id: "1", legacy_shoe_id: "Z123" }),
        sale({ id: "2", legacy_shoe_id: "9120" }),
        sale({ id: "3", legacy_shoe_id: "R5", account_name: "Archiwum 2025" }),
      ],
      [],
      labels
    );
    expect(out).toEqual([]);
  });

  it("splits a multi-pair sale into one entry per pair using items[]", () => {
    const out = findSalesOutsideWarehouse(
      [sale({ id: "m", sale_price: 300, items: [{ shoeId: "R1", price: 100, cost: 0 }, { shoeId: "R2", price: 200, cost: 0 }] })],
      [{ legacy_number: "R1", status: "sold" }],
      labels
    );
    expect(out.map((o) => [o.number, o.price])).toEqual([["R2", 200]]);
  });
});
