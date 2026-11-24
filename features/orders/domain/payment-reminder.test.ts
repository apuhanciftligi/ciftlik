import { describe, expect, it } from "vitest";

import {
  buildPaymentReminderMessage,
  formatReminderAmount,
  formatReminderDate,
  selectOrdersToRemind,
  type PaymentReminderCandidate,
} from "@/features/orders/domain/payment-reminder";

const TODAY = "2026-11-24";

function order(overrides: Partial<PaymentReminderCandidate>): PaymentReminderCandidate {
  return {
    id: "o",
    scheduled_for: "2026-11-01",
    status: "delivered",
    total_minor: 30000,
    amount_paid_minor: 0,
    payment_method: "cash_on_delivery",
    payment_status: "pending",
    ...overrides,
  };
}

describe("selectOrdersToRemind", () => {
  it("keeps unpaid, due orders oldest first with their balance", () => {
    const lines = selectOrdersToRemind(
      [
        order({ id: "b", scheduled_for: "2026-11-08" }),
        order({ id: "a", scheduled_for: "2026-10-25", total_minor: 70000, amount_paid_minor: 30000 }),
      ],
      { today: TODAY, currentOrderId: "b" },
    );
    expect(lines).toEqual([
      { scheduledFor: "2026-10-25", totalMinor: 70000, balanceMinor: 40000 },
      { scheduledFor: "2026-11-08", totalMinor: 30000, balanceMinor: 30000 },
    ]);
  });

  it("drops paid, cancelled, gift and unfinished card orders", () => {
    const lines = selectOrdersToRemind(
      [
        order({ id: "paid", amount_paid_minor: 30000, payment_status: "paid" }),
        order({ id: "cancelled", status: "cancelled" }),
        order({ id: "gift", total_minor: 0 }),
        order({ id: "card", payment_method: "credit_card" }),
      ],
      { today: TODAY, currentOrderId: "x" },
    );
    expect(lines).toEqual([]);
  });

  it("leaves out future orders except the one the button was pressed on", () => {
    const orders = [
      order({ id: "future", scheduled_for: "2026-12-01" }),
      order({ id: "today", scheduled_for: TODAY }),
    ];
    expect(selectOrdersToRemind(orders, { today: TODAY, currentOrderId: "x" })).toHaveLength(1);
    expect(selectOrdersToRemind(orders, { today: TODAY, currentOrderId: "future" })).toHaveLength(2);
  });
});

describe("formatting", () => {
  it("writes dates as day + Turkish month, adding the year only when it differs", () => {
    expect(formatReminderDate("2026-10-05", TODAY)).toBe("5 Ekim");
    expect(formatReminderDate("2025-12-31", TODAY)).toBe("31 Aralık 2025");
  });

  it("writes amounts like a person would", () => {
    expect(formatReminderAmount(30000)).toBe("300 TL");
    expect(formatReminderAmount(190000)).toBe("1.900 TL");
    expect(formatReminderAmount(1250)).toBe("12,50 TL");
  });
});

describe("buildPaymentReminderMessage", () => {
  it("lists every order with a total", () => {
    const message = buildPaymentReminderMessage({
      today: TODAY,
      lines: [
        { scheduledFor: "2026-10-25", totalMinor: 30000, balanceMinor: 30000 },
        { scheduledFor: "2026-11-14", totalMinor: 70000, balanceMinor: 70000 },
      ],
    });
    expect(message.startsWith("Merhabalar,\nApuhan Çiftliği'nden yazıyoruz")).toBe(true);
    expect(message).toContain("Apuhan Çiftliği'nden yazıyoruz 🐓");
    expect(message).toContain("• 25 Ekim – 300 TL\n• 14 Kasım – 700 TL\nToplam: 1.000 TL");
    expect(message).toContain("Ödemeyi zaten yaptıysanız");
  });

  it("uses the singular and no total for one order, and explains a remainder", () => {
    const message = buildPaymentReminderMessage({
      today: TODAY,
      lines: [{ scheduledFor: "2026-11-14", totalMinor: 70000, balanceMinor: 40000 }],
    });
    expect(message).toContain("siparişiniz:\n• 14 Kasım – 400 TL (700 TL siparişin kalanı)");
    expect(message).not.toContain("Toplam");
  });
});
