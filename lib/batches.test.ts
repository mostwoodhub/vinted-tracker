import { describe, expect, it } from "vitest";
import { deriveBatchLabelFromLegacyNumber, normalizeBatchLabel } from "./batches";

describe("normalizeBatchLabel", () => {
  it("reduces a plain batch letter to itself", () => {
    expect(normalizeBatchLabel("R")).toBe("R");
  });

  it("reduces a full item number typed into the batch field to just its leading letters", () => {
    // The exact mistake this function exists to prevent: someone pastes
    // "R15583" (a shoe number) into "Partia" instead of just "R".
    expect(normalizeBatchLabel("R15583")).toBe("R");
  });

  it("reduces a multi-letter prefix to itself", () => {
    expect(normalizeBatchLabel("AA")).toBe("AA");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(normalizeBatchLabel("  R  ")).toBe("R");
  });

  it("returns null for a pure-digit input with no letters to derive from", () => {
    expect(normalizeBatchLabel("15583")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(normalizeBatchLabel("")).toBeNull();
  });
});

describe("deriveBatchLabelFromLegacyNumber", () => {
  it("derives the batch letter from a legacy shoe number", () => {
    expect(deriveBatchLabelFromLegacyNumber("R15950")).toBe("R");
  });

  it("derives a multi-letter prefix", () => {
    expect(deriveBatchLabelFromLegacyNumber("AA1234")).toBe("AA");
  });

  it("returns null for a pure-digit legacy number", () => {
    expect(deriveBatchLabelFromLegacyNumber("8008")).toBeNull();
  });

  it("returns null when there's no legacy number at all", () => {
    expect(deriveBatchLabelFromLegacyNumber(null)).toBeNull();
    expect(deriveBatchLabelFromLegacyNumber(undefined)).toBeNull();
    expect(deriveBatchLabelFromLegacyNumber("")).toBeNull();
  });

  it("returns null for a number with trailing non-digit noise (not a clean <letters><digits> shape)", () => {
    expect(deriveBatchLabelFromLegacyNumber("R159a")).toBeNull();
  });
});
