/**
 * "Ödemeyi hatırlat" — the WhatsApp message the admin sends a customer about
 * every order of theirs still waiting for payment. The panel only prepares
 * the text and opens WhatsApp; the admin reads it and presses send.
 *
 * Pure: which orders belong in the reminder and how the message reads.
 */
import { isAwaitingCardPayment } from "@/features/orders/domain/payment";

import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/features/orders/domain/order";

export interface PaymentReminderCandidate {
  readonly id: string;
  readonly scheduled_for: string; // YYYY-MM-DD
  readonly status: OrderStatus;
  readonly total_minor: number;
  readonly amount_paid_minor: number;
  readonly payment_method: PaymentMethod;
  readonly payment_status: PaymentStatus;
}

export interface PaymentReminderLine {
  readonly scheduledFor: string; // YYYY-MM-DD
  readonly totalMinor: number;
  readonly balanceMinor: number;
}

/**
 * The orders a reminder lists, oldest first:
 *   - still owes money (paid < total) and is not cancelled;
 *   - not an unfinished card checkout — that customer never completed a
 *     PayTR payment, so there is no debt to remind about;
 *   - already due (scheduled today or earlier). A future order is not owed
 *     yet — unless it is the very order the admin pressed the button on.
 */
export function selectOrdersToRemind(
  orders: readonly PaymentReminderCandidate[],
  options: { readonly today: string; readonly currentOrderId: string },
): PaymentReminderLine[] {
  return orders
    .filter((order) => order.status !== "cancelled")
    .filter((order) => order.total_minor - order.amount_paid_minor > 0)
    .filter((order) => !isAwaitingCardPayment(order))
    .filter((order) => order.scheduled_for <= options.today || order.id === options.currentOrderId)
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
    .map((order) => ({
      scheduledFor: order.scheduled_for,
      totalMinor: order.total_minor,
      balanceMinor: order.total_minor - order.amount_paid_minor,
    }));
}

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

/** "2026-10-25" → "25 Ekim"; the year only when it is not the current one. */
export function formatReminderDate(ymd: string, today: string): string {
  const [year, month, day] = ymd.split("-");
  const name = MONTHS_TR[Number(month) - 1] ?? month;
  const base = `${Number(day)} ${name}`;
  return year === today.slice(0, 4) ? base : `${base} ${year}`;
}

const TL_WHOLE = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const TL_CENTS = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Kuruş → "1.900 TL" / "12,50 TL" — how people write amounts in a chat. */
export function formatReminderAmount(minor: number): string {
  return `${minor % 100 === 0 ? TL_WHOLE.format(minor / 100) : TL_CENTS.format(minor / 100)} TL`;
}

export function buildPaymentReminderMessage(input: {
  readonly lines: readonly PaymentReminderLine[];
  readonly today: string;
}): string {
  const total = input.lines.reduce((sum, line) => sum + line.balanceMinor, 0);
  const single = input.lines.length === 1;

  const items = input.lines.map((line) => {
    const date = formatReminderDate(line.scheduledFor, input.today);
    const amount = formatReminderAmount(line.balanceMinor);
    // Partly paid: say it is the remainder, so the figure doesn't look wrong.
    return line.balanceMinor < line.totalMinor
      ? `• ${date} – ${amount} (${formatReminderAmount(line.totalMinor)} siparişin kalanı)`
      : `• ${date} – ${amount}`;
  });

  // No name or title: the system can't know "Hanım" from "Bey" (owner
  // decision 2026-11-24 — a plain greeting for everyone).
  return [
    "Merhabalar,",
    "Apuhan Çiftliği'nden yazıyoruz 🐓 Bizi tercih ettiğiniz için çok teşekkür ederiz.",
    "",
    single
      ? "Kayıtlarımıza göre ödemesi henüz bize ulaşmamış siparişiniz:"
      : "Kayıtlarımıza göre ödemesi henüz bize ulaşmamış siparişleriniz:",
    ...items,
    ...(single ? [] : [`Toplam: ${formatReminderAmount(total)}`]),
    "",
    "Uygun olduğunuz bir zamanda ödemenizi yapabilirseniz çok seviniriz. Ödemeyi zaten yaptıysanız lütfen bu mesajı dikkate almayın, kayıtlarımızı hemen güncelleriz.",
    "",
    "İyi günler dileriz 🙏🏻",
  ].join("\n");
}
