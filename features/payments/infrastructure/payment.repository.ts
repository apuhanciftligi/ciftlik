/**
 * Payment-result writer. Called from the PayTR callback (a system webhook on
 * behalf of no signed-in user) via the service-role client — the sanctioned
 * use of the admin client.
 *
 * Writes a row into the order_payments LEDGER rather than touching
 * orders.payment_status directly. That column, paid_at and amount_paid_minor
 * are derived by recompute_order_payment(), so a direct write desyncs the paid
 * amount immediately and gets silently reverted by the next recompute — see
 * 20260808120000_paytr_payment_ledger for the full failure.
 *
 * Idempotent via the (provider, provider_ref) unique index — PayTR retries the
 * notification until it receives "OK" — and amount-checked before anything is
 * written, so a tampered notification can't over-credit an order.
 */
import "server-only";

import { checkCardPaymentAmount } from "@/features/payments/domain/paytr";
import { ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";
import { formatTRY } from "@/shared/utils/money";

/** Postgres unique_violation — the notification was already processed. */
const UNIQUE_VIOLATION = "23505";

export type CardPaymentOutcome =
  | { kind: "recorded"; installmentFeeMinor: number }
  | { kind: "already_recorded" }
  | { kind: "amount_mismatch"; orderTotalMinor: number | null };

export interface RecordCardPaymentInput {
  orderId: string;
  /** PayTR merchant_oid — the provider-side id, and our idempotency key. */
  merchantOid: string;
  /** Callback `total_amount`: collected, incl. taksit/vade farkı (kuruş). */
  totalAmountMinor: number;
  /** Callback `payment_amount`: what we requested (kuruş); null if absent. */
  paymentAmountMinor: number | null;
}

export async function recordCardPayment(
  input: RecordCardPaymentInput,
): Promise<Result<CardPaymentOutcome, ExternalApiError | NotFoundError>> {
  const supabase = getSupabaseAdminClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("total_minor")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logger.error(
      { orderId: input.orderId, code: error.code },
      "card_payment_order_fetch_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (!order) return err(new NotFoundError({ message: "Sipariş bulunamadı." }));

  // Never record a short capture against the order. Checked BEFORE the insert
  // so a mismatch leaves the ledger untouched. See checkCardPaymentAmount for
  // why an installment surcharge on top of the total is NOT a mismatch.
  const orderTotalMinor =
    order.total_minor === null ? null : Number(order.total_minor);
  const check = checkCardPaymentAmount({
    orderTotalMinor: orderTotalMinor ?? Number.NaN,
    totalAmountMinor: input.totalAmountMinor,
    paymentAmountMinor: input.paymentAmountMinor,
  });
  if (!check.ok) {
    logger.warn(
      {
        orderId: input.orderId,
        expected: orderTotalMinor,
        totalAmount: input.totalAmountMinor,
        paymentAmount: input.paymentAmountMinor,
        merchantOid: input.merchantOid,
      },
      "paytr_amount_mismatch",
    );
    return ok({ kind: "amount_mismatch", orderTotalMinor });
  }

  const { error: insertError } = await supabase.from("order_payments").insert({
    order_id: input.orderId,
    amount_minor: check.bookMinor,
    channel: "card",
    provider: "paytr",
    provider_ref: input.merchantOid,
    // The surcharge stays out of the ledger but on record, so the admin can
    // reconcile the order against what PayTR's panel shows was charged.
    note:
      check.installmentFeeMinor > 0
        ? `PayTR taksitli ödeme: müşteriden çekilen ${formatTRY(input.totalAmountMinor)} (vade farkı ${formatTRY(check.installmentFeeMinor)}).`
        : null,
  });

  if (insertError) {
    // A retried notification for a payment we already booked. Not an error —
    // PayTR just hasn't seen our "OK" yet.
    if (insertError.code === UNIQUE_VIOLATION) return ok({ kind: "already_recorded" });
    logger.error(
      { orderId: input.orderId, code: insertError.code },
      "card_payment_insert_failed",
    );
    return err(
      new ExternalApiError({ message: insertError.message, cause: insertError }),
    );
  }

  // order_payments_recompute has now derived payment_status / paid_at /
  // amount_paid_minor from the ledger. Nothing else to write.
  return ok({ kind: "recorded", installmentFeeMinor: check.installmentFeeMinor });
}
