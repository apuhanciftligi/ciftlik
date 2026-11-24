/**
 * Admin order list: cancelled orders stay out of the list unless the user
 * turns on "İptal edilenleri göster" or explicitly asks for cancelled ones
 * (the Durum dropdown or a filter-builder rule `status = cancelled`).
 */
import type { FilterRule } from "@/shared/filter/filter-rule";

export interface CancelledVisibilityInput {
  readonly showCancelled: boolean;
  readonly status: string | undefined;
  readonly filters: ReadonlyArray<FilterRule>;
}

export function asksForCancelled(
  input: Omit<CancelledVisibilityInput, "showCancelled">,
): boolean {
  if (input.status === "cancelled") return true;
  return input.filters.some(
    (r) => r.column === "status" && r.operator === "equals" && r.value === "cancelled",
  );
}

export function shouldHideCancelledOrders(input: CancelledVisibilityInput): boolean {
  return !input.showCancelled && !asksForCancelled(input);
}
