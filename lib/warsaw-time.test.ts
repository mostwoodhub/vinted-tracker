import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  addMonthsIso,
  daysBetweenIso,
  daysInMonthIso,
  formatDayMonthPl,
  warsawDateString,
  weekdayAbbrevPl,
  weekStartIso,
} from "./warsaw-time";

describe("warsawDateString", () => {
  // The exact scenario the function exists for: a naive
  // `date.toISOString().slice(0, 10)` on a UTC instant would report the
  // wrong calendar day for the first ~2 hours of every Warsaw day.
  it("reports the Warsaw calendar date, not the UTC one, near midnight", () => {
    // 22:30 UTC in August (CEST, UTC+2) is 00:30 the next day in Warsaw.
    const utcInstant = new Date("2026-08-26T22:30:00Z");
    expect(warsawDateString(utcInstant)).toBe("2026-08-27");
  });

  it("agrees with the UTC date well away from midnight", () => {
    const utcInstant = new Date("2026-08-26T10:00:00Z");
    expect(warsawDateString(utcInstant)).toBe("2026-08-26");
  });
});

describe("addDaysIso", () => {
  it("adds days within a month", () => {
    expect(addDaysIso("2026-08-20", 5)).toBe("2026-08-25");
  });

  it("crosses a month boundary", () => {
    expect(addDaysIso("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("crosses a year boundary", () => {
    expect(addDaysIso("2025-12-30", 3)).toBe("2026-01-02");
  });

  it("subtracts days with a negative count", () => {
    expect(addDaysIso("2026-08-02", -3)).toBe("2026-07-30");
  });
});

describe("addMonthsIso", () => {
  it("adds months within a year", () => {
    expect(addMonthsIso("2026-03", 2)).toBe("2026-05");
  });

  it("crosses a year boundary going forward", () => {
    expect(addMonthsIso("2026-11", 3)).toBe("2027-02");
  });

  it("crosses a year boundary going backward", () => {
    expect(addMonthsIso("2026-01", -2)).toBe("2025-11");
  });
});

describe("weekStartIso", () => {
  it("returns the same date for a Monday", () => {
    // 2026-08-24 is a Monday.
    expect(weekStartIso("2026-08-24")).toBe("2026-08-24");
  });

  it("returns the preceding Monday for a mid-week date", () => {
    // 2026-08-26 is a Wednesday.
    expect(weekStartIso("2026-08-26")).toBe("2026-08-24");
  });

  it("returns the preceding Monday for a Sunday (JS getUTCDay() === 0 edge case)", () => {
    // 2026-08-30 is a Sunday.
    expect(weekStartIso("2026-08-30")).toBe("2026-08-24");
  });
});

describe("daysBetweenIso", () => {
  it("computes a simple positive difference", () => {
    expect(daysBetweenIso("2026-08-01", "2026-08-10")).toBe(9);
  });

  it("computes a negative difference when the range is reversed", () => {
    expect(daysBetweenIso("2026-08-10", "2026-08-01")).toBe(-9);
  });

  it("returns 0 for the same date", () => {
    expect(daysBetweenIso("2026-08-10", "2026-08-10")).toBe(0);
  });
});

describe("daysInMonthIso", () => {
  it("returns 31 for a 31-day month", () => {
    expect(daysInMonthIso("2026-08")).toBe(31);
  });

  it("returns 30 for a 30-day month", () => {
    expect(daysInMonthIso("2026-09")).toBe(30);
  });

  it("returns 28 for February in a non-leap year", () => {
    expect(daysInMonthIso("2026-02")).toBe(28);
  });

  it("returns 29 for February in a leap year", () => {
    expect(daysInMonthIso("2028-02")).toBe(29);
  });
});

describe("weekdayAbbrevPl", () => {
  it("labels a known Monday correctly", () => {
    expect(weekdayAbbrevPl("2026-08-24")).toBe("Pon");
  });

  it("labels a known Sunday correctly", () => {
    expect(weekdayAbbrevPl("2026-08-30")).toBe("Ndz");
  });
});

describe("formatDayMonthPl", () => {
  it("formats as DD.MM", () => {
    expect(formatDayMonthPl("2026-08-05")).toBe("05.08");
  });
});
