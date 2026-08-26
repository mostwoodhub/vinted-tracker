import { describe, expect, it } from "vitest";
import type { SaleRow } from "@/lib/sales-types";
import {
  computeBatchPayback,
  computeBatchPerformance,
  computeLinkedSales,
  saleMatchesBatchLabel,
} from "./batch-stats";

function makeSale(overrides: Partial<SaleRow>): SaleRow {
  return {
    id: "sale-id",
    created_at: null,
    sale_date: null,
    platform: null,
    legacy_shoe_id: null,
    brand: null,
    buyer_name: null,
    cost_price: null,
    sale_price: null,
    country: null,
    fee_percent: null,
    fee_amount: null,
    vat_rate: null,
    vat_amount: null,
    vat_mode: null,
    income_tax_applied: null,
    income_tax_amount: null,
    net_profit: null,
    account_name: null,
    quantity: null,
    confirmed: null,
    photo_url: null,
    photo_urls: null,
    label_url: null,
    label_url2: null,
    label_filename: null,
    label_filename2: null,
    receipt_url: null,
    legacy_user_id: null,
    items: null,
    ...overrides,
  };
}

describe("saleMatchesBatchLabel", () => {
  it("matches an exact single-letter prefix", () => {
    expect(saleMatchesBatchLabel("R15950", "R")).toBe(true);
  });

  it("does not match a different batch's shoe id", () => {
    expect(saleMatchesBatchLabel("Q16362", "R")).toBe(false);
  });

  // The exact bug this function was rewritten to fix: a naive `startsWith`
  // check wrongly attributed bulk-import placeholder ids like "IMP0930183"
  // to batch "I" (6167 false matches in real data, vs. 18 real ones).
  it("does not treat an unrelated id that merely starts with the same letter as a match", () => {
    expect(saleMatchesBatchLabel("IMP0930183", "I")).toBe(false);
  });

  it("checks every part of a comma-joined multi-pair sale", () => {
    expect(saleMatchesBatchLabel("Q16362, R15950", "R")).toBe(true);
    expect(saleMatchesBatchLabel("Q16362, R15950", "Q")).toBe(true);
    expect(saleMatchesBatchLabel("Q16362, R15950", "S")).toBe(false);
  });

  it("matches multi-letter batch prefixes exactly", () => {
    expect(saleMatchesBatchLabel("AA1234", "AA")).toBe(true);
    expect(saleMatchesBatchLabel("AA1234", "A")).toBe(false);
  });

  it("returns false for a null legacy shoe id", () => {
    expect(saleMatchesBatchLabel(null, "R")).toBe(false);
  });
});

describe("computeLinkedSales", () => {
  it("sums revenue after fees/VAT/tax, not raw sale price", () => {
    const sales = [
      makeSale({ legacy_shoe_id: "R15950", sale_price: 100, fee_amount: 10, vat_amount: 5, income_tax_amount: 2 }),
    ];
    const result = computeLinkedSales(sales, "R");
    expect(result.count).toBe(1);
    expect(result.amount).toBe(83);
  });

  it("only counts sales matching the given batch label", () => {
    const sales = [
      makeSale({ legacy_shoe_id: "R15950", sale_price: 100 }),
      makeSale({ legacy_shoe_id: "Q16362", sale_price: 200 }),
    ];
    const result = computeLinkedSales(sales, "R");
    expect(result.count).toBe(1);
    expect(result.amount).toBe(100);
  });
});

describe("computeBatchPerformance", () => {
  it("flags break-even reached once net revenue covers cost", () => {
    const sales = [makeSale({ legacy_shoe_id: "R1", sale_price: 500 })];
    const [result] = computeBatchPerformance(sales, [{ batch_name: "R", amount: 300 }]);
    expect(result.breakEvenReached).toBe(true);
    expect(result.remaining).toBe(200);
  });

  it("flags break-even not reached and reports the shortfall as a positive amount", () => {
    const sales = [makeSale({ legacy_shoe_id: "R1", sale_price: 100 })];
    const [result] = computeBatchPerformance(sales, [{ batch_name: "R", amount: 300 }]);
    expect(result.breakEvenReached).toBe(false);
    expect(result.remaining).toBe(200);
  });

  it("sums multiple cost rows for the same batch name", () => {
    const [result] = computeBatchPerformance([], [
      { batch_name: "R", amount: 100 },
      { batch_name: "R", amount: 50 },
    ]);
    expect(result.cost).toBe(150);
  });
});

describe("computeBatchPayback", () => {
  it("prefers a real batch row's purchase_cost over a same-label legacy expense entry", () => {
    const result = computeBatchPayback(
      [],
      [{ batch_name: "R", amount: 999 }],
      [{ label: "R", purchase_cost: 22500, sales_amount: null }]
    );
    const r = result.find((b) => b.label === "R");
    expect(r?.cost).toBe(22500);
  });

  it("flags costMissing when a real batch row exists with no purchase_cost set", () => {
    const result = computeBatchPayback([], [], [{ label: "P", purchase_cost: null, sales_amount: null }]);
    const p = result.find((b) => b.label === "P");
    expect(p?.costMissing).toBe(true);
    expect(p?.cost).toBe(0);
  });

  it("does not flag costMissing for a batch sourced only from a legacy expense entry", () => {
    const result = computeBatchPayback([], [{ batch_name: "Q", amount: 75900 }], []);
    const q = result.find((b) => b.label === "Q");
    expect(q?.costMissing).toBe(false);
    expect(q?.cost).toBe(75900);
  });

  it("combines a batch row's baseline sales_amount with live matching sales", () => {
    const sales = [makeSale({ legacy_shoe_id: "R1", sale_price: 100 })];
    const result = computeBatchPayback(
      sales,
      [],
      [{ label: "R", purchase_cost: 50, sales_amount: 20 }]
    );
    const r = result.find((b) => b.label === "R");
    expect(r?.revenue).toBe(120);
    expect(r?.breakEvenReached).toBe(true);
  });
});
