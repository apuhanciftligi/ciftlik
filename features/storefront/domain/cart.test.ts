import { describe, expect, it } from "vitest";

import {
  cartLineCount,
  cartSubtotalMinor,
  clampQuantity,
  decrementQuantity,
  incrementQuantity,
  isMultipleOfStep,
  isValidQuantity,
  MAX_LINE_QUANTITY,
  quantityFromInput,
} from "@/features/storefront/domain/cart";

describe("isMultipleOfStep", () => {
  it("accepts exact multiples including fractional steps", () => {
    expect(isMultipleOfStep(1, 1)).toBe(true);
    expect(isMultipleOfStep(0.5, 0.5)).toBe(true);
    expect(isMultipleOfStep(1.5, 0.5)).toBe(true);
    expect(isMultipleOfStep(3, 1)).toBe(true);
  });

  it("rejects non-multiples and non-positive steps", () => {
    expect(isMultipleOfStep(0.75, 0.5)).toBe(false);
    expect(isMultipleOfStep(2.5, 1)).toBe(false);
    expect(isMultipleOfStep(1, 0)).toBe(false);
  });

  it("does not drift after repeated 0.5 additions", () => {
    let q = 0;
    for (let i = 0; i < 7; i += 1) q += 0.5; // 3.5
    expect(isMultipleOfStep(q, 0.5)).toBe(true);
  });
});

describe("isValidQuantity", () => {
  it("enforces min and step together", () => {
    expect(isValidQuantity(1, 1, 1)).toBe(true);
    expect(isValidQuantity(0.5, 0.5, 0.5)).toBe(true);
    expect(isValidQuantity(0.25, 0.5, 0.5)).toBe(false); // below min
    expect(isValidQuantity(0.75, 0.5, 0.5)).toBe(false); // off-step
    expect(isValidQuantity(0, 1, 1)).toBe(false);
    expect(isValidQuantity(Number.NaN, 1, 1)).toBe(false);
  });
});

describe("clampQuantity", () => {
  it("snaps to the nearest valid step at or above min", () => {
    expect(clampQuantity(0.7, 0.5, 0.5)).toBe(0.5);
    expect(clampQuantity(0.8, 0.5, 0.5)).toBe(1);
    expect(clampQuantity(0, 1, 1)).toBe(1);
    expect(clampQuantity(3.2, 1, 1)).toBe(3);
  });
});

describe("increment / decrement", () => {
  it("moves by one step and floors at min", () => {
    expect(incrementQuantity(1, 0.5)).toBe(1.5);
    expect(decrementQuantity(1, 0.5, 0.5)).toBe(0.5);
    expect(decrementQuantity(0.5, 0.5, 0.5)).toBe(0.5); // can't go below min
  });
});

describe("cart aggregates", () => {
  it("counts distinct lines", () => {
    expect(
      cartLineCount([
        { product_key: "eggs", quantity: 2 },
        { product_key: "milk", quantity: 1 },
      ]),
    ).toBe(2);
  });

  it("sums line totals without float drift", () => {
    expect(cartSubtotalMinor([12500, 4000, 35000])).toBe(51500);
    expect(cartSubtotalMinor([])).toBe(0);
  });
});

describe("quantityFromInput", () => {
  it("parses whole numbers and both decimal separators", () => {
    expect(quantityFromInput("3", 1, 1)).toBe(3);
    expect(quantityFromInput(" 12 ", 1, 1)).toBe(12);
    expect(quantityFromInput("1,5", 0.5, 0.5)).toBe(1.5);
    expect(quantityFromInput("1.5", 0.5, 0.5)).toBe(1.5);
    expect(quantityFromInput(",5", 0.5, 0.5)).toBe(0.5);
  });

  it("returns null for text that is not a number", () => {
    expect(quantityFromInput("", 1, 1)).toBeNull();
    expect(quantityFromInput("abc", 1, 1)).toBeNull();
    expect(quantityFromInput("-2", 1, 1)).toBeNull();
    expect(quantityFromInput("1e3", 1, 1)).toBeNull();
    expect(quantityFromInput("1,5,0", 0.5, 0.5)).toBeNull();
  });

  it("raises anything below the minimum to the minimum", () => {
    expect(quantityFromInput("0", 1, 1)).toBe(1);
    expect(quantityFromInput("0,2", 0.5, 0.5)).toBe(0.5);
  });

  it("snaps to the product's step", () => {
    expect(quantityFromInput("1,3", 0.5, 0.5)).toBe(1.5);
    expect(quantityFromInput("1,2", 0.5, 0.5)).toBe(1);
    expect(quantityFromInput("2,5", 1, 1)).toBe(3);
  });

  it("caps at MAX_LINE_QUANTITY, staying on the step", () => {
    expect(quantityFromInput("10000", 1, 1)).toBe(MAX_LINE_QUANTITY);
    expect(quantityFromInput("10000", 0.5, 0.5)).toBe(MAX_LINE_QUANTITY);
    const q = quantityFromInput("5000", 2, 2);
    expect(q).toBe(998);
  });
});
