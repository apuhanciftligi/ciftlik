import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/utils/date", () => ({ todayInIstanbul: () => "2026-11-24" }));

const loadPaymentReminderData = vi.fn();
vi.mock("@/features/orders/infrastructure/order-payment.repository", () => ({
  loadPaymentReminderData: (...a: unknown[]) => loadPaymentReminderData(...a),
}));

const { getPaymentReminder } = await import("./payment-reminder");

const order = {
  id: "o2",
  customer_id: "c1",
  status: "delivered" as const,
  total_minor: 30000,
  amount_paid_minor: 0,
  payment_method: "cash_on_delivery" as const,
  payment_status: "pending" as const,
};

const candidate = (id: string, scheduled_for: string, total_minor: number) => ({
  ...order,
  id,
  scheduled_for,
  total_minor,
});

beforeEach(() => {
  vi.clearAllMocks();
  loadPaymentReminderData.mockResolvedValue({
    ok: true,
    value: {
      customerPhone: "+905321234567",
      orders: [candidate("o1", "2026-11-01", 30000), candidate("o2", "2026-11-14", 70000)],
    },
  });
});

describe("getPaymentReminder", () => {
  it("builds a WhatsApp link to the customer with every unpaid order", async () => {
    const reminder = await getPaymentReminder(order);
    expect(reminder).not.toBeNull();
    expect(reminder?.orderCount).toBe(2);
    expect(reminder?.totalMinor).toBe(100000);
    expect(reminder?.link.startsWith("https://api.whatsapp.com/send?phone=905321234567&text=")).toBe(true);
    const text = decodeURIComponent(reminder!.link.split("&text=")[1]!);
    expect(text.startsWith("Merhabalar,\n")).toBe(true);
    expect(text).not.toContain("Nurten");
    expect(text).toContain("• 1 Kasım – 300 TL\n• 14 Kasım – 700 TL\nToplam: 1.000 TL");
    expect(loadPaymentReminderData).toHaveBeenCalledWith("c1");
  });

  it("is null for a paid, cancelled or unfinished card order without reading anything", async () => {
    await expect(getPaymentReminder({ ...order, amount_paid_minor: 30000 })).resolves.toBeNull();
    await expect(getPaymentReminder({ ...order, status: "cancelled" })).resolves.toBeNull();
    await expect(getPaymentReminder({ ...order, payment_method: "credit_card" })).resolves.toBeNull();
    expect(loadPaymentReminderData).not.toHaveBeenCalled();
  });

  it("is null when the customer has no phone on file", async () => {
    loadPaymentReminderData.mockResolvedValue({
      ok: true,
      value: { customerPhone: null, orders: [candidate("o2", "2026-11-14", 30000)] },
    });
    await expect(getPaymentReminder(order)).resolves.toBeNull();
  });
});
