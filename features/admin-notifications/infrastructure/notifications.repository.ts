import "server-only";

/**
 * Persistence for the admin notification feed.
 *
 * Writes (insertNotification) run through the service-role client — the
 * customer-facing flows that create these rows (place-order.ts,
 * send-order-confirmation.ts, recurring-order-request.ts) have no admin
 * session, so RLS's admin-only policy would reject them (mirrors
 * shared/audit/log-audit.ts's use of getSupabaseAdminClient()).
 *
 * Reads/updates (list, count, mark read) run through the SSR client so RLS
 * still enforces admin-only access — an admin Server Action/Component is
 * the only caller.
 */
import { AppError, ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { AdminNotification, NotificationType } from "@/features/admin-notifications/domain/notification";

export interface InsertNotificationInput {
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly link: string;
  readonly orderId?: string;
  readonly recurringTemplateId?: string;
}

function rowToNotification(row: Record<string, unknown>): AdminNotification {
  return {
    id: String(row.id),
    type: row.type as NotificationType,
    title: String(row.title),
    body: String(row.body),
    link: String(row.link),
    readAt: typeof row.read_at === "string" ? row.read_at : null,
    createdAt: String(row.created_at),
  };
}

/** notifications isn't in the generated Database type yet — the repo's
 *  documented un-generated-table cast pattern (pnpm db:types regenerates it). */
export async function insertNotification(
  input: InsertNotificationInput,
): Promise<Result<void, AppError>> {
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("notifications").insert({
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link,
    order_id: input.orderId ?? null,
    recurring_template_id: input.recurringTemplateId ?? null,
  });
  if (error) {
    logger.error({ code: error.code, type: input.type }, "notification_insert_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

export async function listRecentNotifications(
  limit: number,
): Promise<AdminNotification[]> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logger.warn({ code: error.code }, "list_notifications_failed");
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map(rowToNotification);
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("notifications" as any)
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) {
    logger.warn({ code: error.code }, "count_unread_notifications_failed");
    return 0;
  }
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<Result<void, AppError>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("notifications" as any)
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    logger.warn({ code: error.code, id }, "mark_notification_read_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

export async function markAllNotificationsRead(): Promise<Result<void, AppError>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("notifications" as any)
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) {
    logger.warn({ code: error.code }, "mark_all_notifications_read_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

export interface PendingPushNotification {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly link: string;
  readonly createdAt: string;
}

/**
 * Claims every bell row that has not been pushed yet and returns it. The
 * UPDATE … RETURNING is the claim: two senders running at once (an order
 * landing while a reminder comes due) each get a disjoint set, so no row is
 * pushed twice. Service-role: the senders run inside customer flows (order
 * placement, PayTR webhook) with no admin session.
 *
 * Bounded so a long backlog can never turn into one huge statement; stale
 * rows past the limit are claimed by the next call.
 */
export async function claimPendingPushNotifications(
  limit: number,
): Promise<Result<PendingPushNotification[], AppError>> {
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data: pending, error: listError } = await client
    .from("notifications")
    .select("id")
    .is("pushed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (listError) {
    logger.error({ code: listError.code }, "push_pending_list_failed");
    return err(new ExternalApiError({ message: listError.message, cause: listError }));
  }
  const ids = ((pending ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (ids.length === 0) return ok([]);

  const { data, error } = await client
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .in("id", ids)
    // Re-checked in the UPDATE itself: a concurrent sender that claimed the
    // same row first leaves nothing for this one to return.
    .is("pushed_at", null)
    .select("id, title, body, link, created_at");
  if (error) {
    logger.error({ code: error.code }, "push_claim_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      body: String(row.body),
      link: String(row.link),
      createdAt: String(row.created_at),
    })),
  );
}
