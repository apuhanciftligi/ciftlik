/**
 * Invoice queue persistence. The worker runs on behalf of no signed-in user
 * (payment webhook, cron), so it uses the service-role client — the
 * sanctioned use of the admin client. Admin screens read through the
 * session client, where RLS limits the table to admins.
 *
 * `invoices` and `claim_due_invoices` are not in the generated Database type
 * yet; rows are Zod-parsed instead (the un-generated-table cast pattern).
 */
import "server-only";

import { z } from "zod";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { vatRateSchema } from "@/shared/vat";

import {
  INVOICE_CANCEL_REASONS,
  type InvoiceCancelReason,
  type InvoiceChannel,
} from "@/features/invoicing/domain/invoice";
import type { InvoiceOrder } from "@/features/invoicing/domain/order-invoice";

export type InvoiceStatus =
  | "pending"
  | "processing"
  | "issued"
  | "failed"
  | "needs_attention"
  | "cancelled";

const invoiceRowSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  status: z.enum(["pending", "processing", "issued", "failed", "needs_attention", "cancelled"]),
  channel: z.enum(["earsiv", "efatura"]).nullable(),
  invoice_number: z.string().nullable(),
  view_url: z.string().nullable(),
  attempts: z.number().int(),
  last_error: z.string().nullable(),
  issued_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  cancel_requested_at: z.string().nullable(),
  cancel_reason: z.enum(INVOICE_CANCEL_REASONS).nullable(),
  created_at: z.string(),
});
export type InvoiceRow = z.infer<typeof invoiceRowSchema>;

const INVOICE_COLUMNS =
  "id, order_id, status, channel, invoice_number, view_url, attempts, last_error, issued_at, cancelled_at, cancel_requested_at, cancel_reason, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Untyped = any;

function dbError(event: string, error: { code?: string; message: string }, context: object) {
  logger.error({ ...context, code: error.code }, event);
  return err(new ExternalApiError({ message: error.message, cause: error }));
}

/** Hand due invoices to this worker (atomic, skip-locked). */
export async function claimDueInvoices(limit: number): Promise<Result<InvoiceRow[], ExternalApiError>> {
  const supabase = getSupabaseAdminClient() as Untyped;
  const { data, error } = await supabase.rpc("claim_due_invoices", { p_limit: limit });
  if (error) return dbError("invoice_claim_failed", error, {});
  const parsed = z.array(invoiceRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    logger.error({ issueCount: parsed.error.issues.length }, "invoice_claim_invalid_rows");
    return err(new ExternalApiError({ message: "Fatura kuyruğu okunamadı." }));
  }
  return ok(parsed.data);
}

/** Hand issued invoices whose order was cancelled to this worker (atomic, skip-locked). */
export async function claimInvoiceCancellations(limit: number): Promise<Result<InvoiceRow[], ExternalApiError>> {
  const supabase = getSupabaseAdminClient() as Untyped;
  const { data, error } = await supabase.rpc("claim_invoice_cancellations", { p_limit: limit });
  if (error) return dbError("invoice_cancel_claim_failed", error, {});
  const parsed = z.array(invoiceRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    logger.error({ issueCount: parsed.error.issues.length }, "invoice_cancel_claim_invalid_rows");
    return err(new ExternalApiError({ message: "Fatura iptal kuyruğu okunamadı." }));
  }
  return ok(parsed.data);
}

const orderBundleSchema = z.object({
  order_number: z.string(),
  status: z.string(),
  payment_status: z.string(),
  order_payments: z.array(z.object({ provider: z.string().nullable() })),
  paid_at: z.string().nullable(),
  total_minor: z.coerce.number().int(),
  delivery_fee_minor: z.coerce.number().int(),
  fulfillment_channel: z.enum(["delivery", "shipping"]),
  delivery_address_snapshot: z.record(z.unknown()),
  customers: z.object({
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  order_items: z.array(
    z.object({
      product_key: z.string(),
      quantity: z.coerce.number(),
      line_total_minor: z.coerce.number().int().nullable(),
      product_snapshot: z.record(z.unknown()),
      products: z.object({ vat_rate: vatRateSchema, invoice_name: z.string().nullable() }),
    }),
  ),
});

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Load everything the invoice needs for one order, in one query. */
export async function loadInvoiceOrder(orderId: string): Promise<Result<InvoiceOrder, ExternalApiError>> {
  const supabase = getSupabaseAdminClient() as Untyped;
  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_number, status, payment_status, paid_at, total_minor, delivery_fee_minor, " +
        "fulfillment_channel, delivery_address_snapshot, customers(first_name, last_name, email), " +
        "order_items(product_key, quantity, line_total_minor, product_snapshot, products(vat_rate, invoice_name)), " +
        "order_payments(provider)",
    )
    .eq("id", orderId)
    .single();
  if (error) return dbError("invoice_order_load_failed", error, { orderId });
  const parsed = orderBundleSchema.safeParse(data);
  if (!parsed.success) {
    logger.error({ orderId, issueCount: parsed.error.issues.length }, "invoice_order_invalid");
    return err(new ExternalApiError({ message: "Sipariş fatura için okunamadı." }));
  }
  const o = parsed.data;
  const a = o.delivery_address_snapshot;
  const street =
    [text(a.neighborhood), text(a.street), text(a.building_no) && `No:${text(a.building_no)}`,
      text(a.apartment_no) && `D:${text(a.apartment_no)}`]
      .filter(Boolean)
      .join(" ") || text(a.raw_text);
  return ok({
    orderNumber: o.order_number,
    status: o.status,
    paymentStatus: o.payment_status,
    paidViaPaytr: o.order_payments.some((p) => p.provider === "paytr"),
    paidAt: o.paid_at ? new Date(o.paid_at) : null,
    totalMinor: o.total_minor,
    deliveryFeeMinor: o.delivery_fee_minor,
    fulfillmentChannel: o.fulfillment_channel,
    customer: {
      firstName: o.customers.first_name ?? "",
      lastName: o.customers.last_name ?? "",
      email: o.customers.email,
    },
    address: {
      street,
      district: text(a.district),
      city: text(a.city),
      postalCode: text(a.postal_code) || null,
    },
    items: o.order_items.map((i) => ({
      // The product's invoice name when set (current value, like the KDV
      // rate), else the name the customer saw when ordering.
      name: text(i.products.invoice_name) || text(i.product_snapshot.display_name) || i.product_key,
      unit: text(i.product_snapshot.unit),
      quantity: i.quantity,
      lineTotalMinor: i.line_total_minor ?? 0,
      vatRate: i.products.vat_rate,
    })),
  });
}

async function updateInvoice(
  id: string,
  patch: Record<string, unknown>,
  event: string,
): Promise<Result<void, ExternalApiError>> {
  const supabase = getSupabaseAdminClient() as Untyped;
  const { error } = await supabase
    .from("invoices")
    .update({ ...patch, locked_until: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return dbError(event, error, { invoiceId: id });
  return ok(undefined);
}

export function markInvoiceIssued(
  id: string,
  issued: { channel: InvoiceChannel; invoiceNumber: string; viewUrl: string | null; issuedAt: Date },
): Promise<Result<void, ExternalApiError>> {
  return updateInvoice(
    id,
    {
      status: "issued",
      channel: issued.channel,
      invoice_number: issued.invoiceNumber,
      view_url: issued.viewUrl,
      issued_at: issued.issuedAt.toISOString(),
      last_error: null,
    },
    "invoice_mark_issued_failed",
  );
}

/**
 * Record a cancellation QNB has accepted. Only an issued invoice can be
 * cancelled; false when the row is no longer 'issued' (someone else
 * cancelled it first).
 */
export async function markInvoiceCancelled(
  id: string,
  cancelledAt: Date,
  reason: InvoiceCancelReason,
): Promise<Result<boolean, ExternalApiError>> {
  const supabase = getSupabaseAdminClient() as Untyped;
  const { data, error } = await supabase
    .from("invoices")
    .update({
      status: "cancelled",
      cancelled_at: cancelledAt.toISOString(),
      cancel_reason: reason,
      last_error: null,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "issued")
    .select("id");
  if (error) return dbError("invoice_mark_cancelled_failed", error, { invoiceId: id });
  return ok((data ?? []).length > 0);
}

/** A failed cancellation: the invoice stays issued and is tried again at `nextAttemptAt`. */
export function markInvoiceCancelFailed(
  id: string,
  reason: string,
  nextAttemptAt: Date,
): Promise<Result<void, ExternalApiError>> {
  return updateInvoice(
    id,
    { last_error: reason, next_attempt_at: nextAttemptAt.toISOString() },
    "invoice_mark_cancel_failed_failed",
  );
}

/** A failed try: retried at `nextAttemptAt`, or parked for a human when null. */
export function markInvoiceFailed(
  id: string,
  reason: string,
  nextAttemptAt: Date | null,
): Promise<Result<void, ExternalApiError>> {
  return updateInvoice(
    id,
    nextAttemptAt
      ? { status: "failed", last_error: reason, next_attempt_at: nextAttemptAt.toISOString() }
      : { status: "needs_attention", last_error: reason },
    "invoice_mark_failed_failed",
  );
}

// ---- admin (session client, RLS: admins only) --------------------------------

/** The order behind an invoice, as the admin list shows it. */
export interface InvoiceListOrder {
  readonly orderNumber: string;
  readonly orderedAt: string;
  readonly status: string;
  readonly totalMinor: number;
  readonly fulfillmentChannel: "delivery" | "shipping";
  readonly customerName: string;
  readonly customerEmail: string | null;
  readonly items: readonly {
    readonly name: string;
    /** The product's "Faturadaki adı" when it differs from `name`. */
    readonly invoiceName: string | null;
    readonly quantity: number;
    readonly unitLabel: string;
    readonly lineTotalMinor: number;
  }[];
  /** Latest incoming PayTR payment, if any. */
  readonly paytrPaidAt: string | null;
}

export interface InvoiceListRow extends InvoiceRow {
  readonly order: InvoiceListOrder;
}

/** Live invoices (queued, issued, failed …) or the cancelled ones. */
export type InvoiceListTab = "active" | "cancelled";

const listOrderSchema = z.object({
  order_number: z.string(),
  created_at: z.string(),
  status: z.string(),
  total_minor: z.coerce.number().int(),
  fulfillment_channel: z.enum(["delivery", "shipping"]),
  customers: z
    .object({ first_name: z.string().nullable(), last_name: z.string().nullable(), email: z.string().nullable() })
    .nullable(),
  order_items: z.array(
    z.object({
      product_key: z.string(),
      quantity: z.coerce.number(),
      line_total_minor: z.coerce.number().int().nullable(),
      product_snapshot: z.record(z.unknown()),
      products: z.object({ invoice_name: z.string().nullable() }).nullable(),
    }),
  ),
  order_payments: z.array(
    z.object({ provider: z.string().nullable(), amount_minor: z.coerce.number(), paid_at: z.string() }),
  ),
});

function toListOrder(o: z.infer<typeof listOrderSchema>): InvoiceListOrder {
  const paytrPaidAt =
    o.order_payments
      .filter((p) => p.provider === "paytr" && p.amount_minor > 0)
      .map((p) => p.paid_at)
      .sort()
      .at(-1) ?? null;
  return {
    orderNumber: o.order_number,
    orderedAt: o.created_at,
    status: o.status,
    totalMinor: o.total_minor,
    fulfillmentChannel: o.fulfillment_channel,
    customerName:
      [text(o.customers?.first_name), text(o.customers?.last_name)].filter(Boolean).join(" ") || "—",
    customerEmail: o.customers?.email ?? null,
    items: o.order_items.map((i) => {
      const name = text(i.product_snapshot.display_name) || i.product_key;
      const invoiceName = text(i.products?.invoice_name);
      return {
        name,
        invoiceName: invoiceName && invoiceName !== name ? invoiceName : null,
        quantity: i.quantity,
        unitLabel: text(i.product_snapshot.unit_label),
        lineTotalMinor: i.line_total_minor ?? 0,
      };
    }),
    paytrPaidAt,
  };
}

/** Embedded in one query with the invoices: no per-row fetches. */
const LIST_ORDER_SELECT =
  "orders(order_number, created_at, status, total_minor, fulfillment_channel, " +
  "customers(first_name, last_name, email), " +
  "order_items(product_key, quantity, line_total_minor, product_snapshot, products(invoice_name)), " +
  "order_payments(provider, amount_minor, paid_at))";

export async function listInvoices(
  tab: InvoiceListTab,
  page: number,
  pageSize: number,
): Promise<Result<{ rows: InvoiceListRow[]; total: number; counts: Record<InvoiceListTab, number> }, ExternalApiError>> {
  const supabase = (await createSupabaseServerClient()) as Untyped;
  const from = page * pageSize;
  let query = supabase
    .from("invoices")
    .select(`${INVOICE_COLUMNS}, ${LIST_ORDER_SELECT}`)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  query = tab === "cancelled" ? query.eq("status", "cancelled") : query.neq("status", "cancelled");
  const [list, active, cancelled] = await Promise.all([
    query,
    supabase.from("invoices").select("id", { count: "exact", head: true }).neq("status", "cancelled"),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
  ]);
  const failed = list.error ?? active.error ?? cancelled.error;
  if (failed) return dbError("invoice_list_failed", failed, { tab, page });
  const parsed = z.array(invoiceRowSchema.extend({ orders: listOrderSchema })).safeParse(list.data ?? []);
  if (!parsed.success) {
    logger.error({ tab, issueCount: parsed.error.issues.length }, "invoice_list_invalid");
    return err(new ExternalApiError({ message: "Faturalar okunamadı." }));
  }
  const counts = { active: active.count ?? 0, cancelled: cancelled.count ?? 0 };
  return ok({
    rows: parsed.data.map(({ orders, ...row }) => ({ ...row, order: toListOrder(orders) })),
    total: counts[tab],
    counts,
  });
}

/** One invoice row, or null when it does not exist (or the user is no admin). */
export async function getInvoice(id: string): Promise<Result<InvoiceRow | null, ExternalApiError>> {
  const supabase = (await createSupabaseServerClient()) as Untyped;
  const { data, error } = await supabase.from("invoices").select(INVOICE_COLUMNS).eq("id", id).maybeSingle();
  if (error) return dbError("invoice_get_failed", error, { invoiceId: id });
  if (data === null) return ok(null);
  const parsed = invoiceRowSchema.safeParse(data);
  if (!parsed.success) {
    logger.error({ invoiceId: id, issueCount: parsed.error.issues.length }, "invoice_get_invalid");
    return err(new ExternalApiError({ message: "Fatura okunamadı." }));
  }
  return ok(parsed.data);
}

/** Put a failed / parked invoice back in the queue, due now. */
export async function requeueInvoice(id: string): Promise<Result<boolean, ExternalApiError>> {
  const supabase = (await createSupabaseServerClient()) as Untyped;
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "pending", next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["failed", "needs_attention"])
    .select("id");
  if (error) return dbError("invoice_requeue_failed", error, { invoiceId: id });
  return ok((data ?? []).length > 0);
}
