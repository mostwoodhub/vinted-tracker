import { describe, expect, it } from "vitest";
import { rotationFillScale } from "./photo-rotate";

describe("rotationFillScale", () => {
  it("is 1 with no rotation", () => {
    expect(rotationFillScale(1200, 800, 0)).toBe(1);
  });

  it("grows with the angle, symmetric left/right", () => {
    const a = rotationFillScale(1200, 800, 3);
    expect(a).toBeGreaterThan(1);
    expect(rotationFillScale(1200, 800, -3)).toBeCloseTo(a, 10);
    expect(rotationFillScale(1200, 800, 6)).toBeGreaterThan(a);
  });

  it("covers the frame: rotated corners stay inside the scaled image", () => {
    const [w, h, deg] = [1200, 800, 7];
    const s = rotationFillScale(w, h, deg);
    const t = (deg * Math.PI) / 180;
    // frame corner expressed in the image's own (rotated) axes
    const x = (w / 2) * Math.cos(t) + (h / 2) * Math.sin(t);
    const y = (w / 2) * Math.sin(t) + (h / 2) * Math.cos(t);
    expect(x).toBeLessThanOrEqual((s * w) / 2 + 1e-9);
    expect(y).toBeLessThanOrEqual((s * h) / 2 + 1e-9);
  });
});
