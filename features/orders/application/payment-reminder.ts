import "server-only";

/**
 * Prepares the "Ödemeyi hatırlat" WhatsApp link for an order's Tahsilat
 * section: every order of the same customer still waiting for payment, in one
 * polite message (domain/payment-reminder.ts). Built when the order is loaded
 * so the button is a plain link — opening WhatsApp needs no extra round trip,
 * which on the phone app also means no blocked pop-up.
 *
 * Null when there is nothing to remind about (order paid, cancelled, an
 * unfinished card checkout) or the customer has no phone on file.
 */
import {
  buildPaymentReminderMessage,
  selectOrdersToRemind,
} from "@/features/orders/domain/payment-reminder";
import { isAwaitingCardPayment } from "@/features/orders/domain/payment";
import { loadPaymentReminderData } from "@/features/orders/infrastructure/order-payment.repository";
import { todayInIstanbul } from "@/shared/utils/date";
import { buildWhatsAppLink } from "@/shared/utils/whatsapp";

import type { Order } from "@/features/orders/domain/order";

export interface PaymentReminder {
  /** WhatsApp link with the message pre-filled; WhatsApp still waits for "send". */
  readonly link: string;
  readonly orderCount: number;
  readonly totalMinor: number;
}

export async function getPaymentReminder(
  order: Pick<
    Order,
    "id" | "customer_id" | "status" | "total_minor" | "amount_paid_minor" | "payment_method" | "payment_status"
  >,
): Promise<PaymentReminder | null> {
  if (order.status === "cancelled") return null;
  if (order.total_minor - order.amount_paid_minor <= 0) return null;
  if (isAwaitingCardPayment(order)) return null;

  const data = await loadPaymentReminderData(order.customer_id);
  if (!data.ok || !data.value.customerPhone) return null;

  const today = todayInIstanbul();
  const lines = selectOrdersToRemind(data.value.orders, { today, currentOrderId: order.id });
  if (lines.length === 0) return null;

  const message = buildPaymentReminderMessage({ lines, today });
  return {
    link: buildWhatsAppLink(data.value.customerPhone, message),
    orderCount: lines.length,
    totalMinor: lines.reduce((sum, line) => sum + line.balanceMinor, 0),
  };
}
