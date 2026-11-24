import { describe, expect, it } from "vitest";

import { shouldHideCancelledOrders } from "./cancelled-visibility";

import type { FilterRule } from "@/shared/filter/filter-rule";

const rule = (over: Partial<FilterRule>): FilterRule => ({
  id: "r1",
  column: "status",
  operator: "equals",
  value: "cancelled",
  value2: "",
  ...over,
});

describe("shouldHideCancelledOrders", () => {
  it("hides cancelled orders by default", () => {
    expect(shouldHideCancelledOrders({ showCancelled: false, status: undefined, filters: [] })).toBe(true);
  });

  it("shows them when the toggle is on", () => {
    expect(shouldHideCancelledOrders({ showCancelled: true, status: undefined, filters: [] })).toBe(false);
  });

  it("shows them when the status dropdown asks for cancelled", () => {
    expect(shouldHideCancelledOrders({ showCancelled: false, status: "cancelled", filters: [] })).toBe(false);
  });

  it("still hides them for another status", () => {
    expect(shouldHideCancelledOrders({ showCancelled: false, status: "pending", filters: [] })).toBe(true);
  });

  it("shows them when a filter rule asks for status = cancelled", () => {
    expect(shouldHideCancelledOrders({ showCancelled: false, status: undefined, filters: [rule({})] })).toBe(false);
  });

  it("ignores status rules that do not ask for cancelled", () => {
    expect(
      shouldHideCancelledOrders({
        showCancelled: false,
        status: undefined,
        filters: [rule({ operator: "not_equals" }), rule({ value: "pending" })],
      }),
    ).toBe(true);
  });
});
