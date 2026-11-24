import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/features/orders/domain/order";
import type { OrderPayment, PaymentChannel } from "@/features/orders/domain/payment";
import type { PaymentReminderCandidate } from "@/features/orders/domain/payment-reminder";

// `order_payments` isn't in the generated Database type yet — these use the
// un-generated-table cast pattern used elsewhere. The order's amount_paid +
// payment_status are kept in sync by DB triggers, so these are plain writes.

interface PaymentRow {
  id: string;
  order_id: string;
  amount_minor: number | string;
  channel: string;
  paid_at: string;
  note: string | null;
  created_at: string;
}

function rowToPayment(r: PaymentRow): OrderPayment {
  return {
    id: r.id,
    order_id: r.order_id,
    amount_minor: Number(r.amount_minor),
    channel: r.channel as PaymentChannel,
    paid_at: new Date(r.paid_at),
    note: r.note ?? null,
    created_at: new Date(r.created_at),
  };
}

export async function listPaymentsForOrder(
  orderId: string,
): Promise<Result<OrderPayment[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("order_payments")
    .select("id, order_id, amount_minor, channel, paid_at, note, created_at")
    .eq("order_id", orderId)
    .order("paid_at", { ascending: true });
  if (error) {
    logger.error({ orderId, code: error.code }, "list_payments_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(((data ?? []) as PaymentRow[]).map(rowToPayment));
}

export interface InsertPaymentInput {
  order_id: string;
  amount_minor: number;
  channel: PaymentChannel;
  paid_at: string; // ISO
  note: string | null;
  created_by: string;
}

export async function insertPayment(
  input: InsertPaymentInput,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("order_payments").insert({
    order_id: input.order_id,
    amount_minor: input.amount_minor,
    channel: input.channel,
    paid_at: input.paid_at,
    note: input.note,
    created_by: input.created_by,
  });
  if (error) {
    logger.error({ orderId: input.order_id, code: error.code }, "insert_payment_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

export async function deletePayment(
  paymentId: string,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("order_payments")
    .delete()
    .eq("id", paymentId);
  if (error) {
    logger.error({ paymentId, code: error.code }, "delete_payment_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

export interface PaymentReminderData {
  readonly customerPhone: string | null;
  readonly orders: PaymentReminderCandidate[];
}

/** Guards one reminder against a pathological customer history; a real
 *  customer has a handful of open orders. */
const REMINDER_ORDER_LIMIT = 100;

/**
 * The customer's orders that may still owe money (payment_status pending /
 * partial — kept in sync with the ledger by DB triggers), plus the phone the
 * WhatsApp message goes to. The exact "is it due" rules live in
 * domain/payment-reminder.ts.
 */
export async function loadPaymentReminderData(
  customerId: string,
): Promise<Result<PaymentReminderData, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const [ordersResult, customerResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, scheduled_for, status, total_minor, amount_paid_minor, payment_method, payment_status")
      .eq("customer_id", customerId)
      .neq("status", "cancelled")
      .in("payment_status", ["pending", "partial"])
      .order("scheduled_for", { ascending: true })
      .limit(REMINDER_ORDER_LIMIT),
    supabase.from("customers").select("phone").eq("id", customerId).maybeSingle(),
  ]);
  const error = ordersResult.error ?? customerResult.error;
  if (error) {
    logger.error({ code: error.code }, "load_payment_reminder_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok({
    customerPhone: customerResult.data?.phone ?? null,
    orders: (ordersResult.data ?? []).map((row) => ({
      id: row.id,
      scheduled_for: row.scheduled_for,
      status: row.status as OrderStatus,
      total_minor: Number(row.total_minor),
      amount_paid_minor: Number(row.amount_paid_minor ?? 0),
      payment_method: row.payment_method as PaymentMethod,
      payment_status: row.payment_status as PaymentStatus,
    })),
  });
}
