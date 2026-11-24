import "server-only";

/**
 * Persistence for admin Web Push subscriptions (push_subscriptions table).
 *
 * Save/remove run through the SSR client so RLS (is_admin()) still gates the
 * write; the sender reads and prunes through the service-role client because
 * it runs inside customer flows with no admin session — same split as
 * notifications.repository.ts.
 *
 * push_subscriptions isn't in the generated Database type yet — the repo's
 * documented un-generated-table cast pattern (pnpm db:types regenerates it).
 */
import { AppError, ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { PushSubscriptionInput } from "@/features/admin-notifications/domain/push";

export interface StoredPushSubscription {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

/** Admins are a handful of people with a device or two each; this cap only
 *  keeps a runaway table from turning one notification into a flood. */
const MAX_SUBSCRIPTIONS = 50;

export async function savePushSubscription(input: {
  readonly userId: string;
  readonly subscription: PushSubscriptionInput;
  readonly userAgent: string | null;
}): Promise<Result<void, AppError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("push_subscriptions").upsert(
    {
      user_id: input.userId,
      endpoint: input.subscription.endpoint,
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth,
      user_agent: input.userAgent,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    logger.error({ code: error.code }, "push_subscription_save_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

export async function removePushSubscription(endpoint: string): Promise<Result<void, AppError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) {
    logger.error({ code: error.code }, "push_subscription_remove_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

export async function listAllPushSubscriptions(): Promise<
  Result<StoredPushSubscription[], AppError>
> {
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .order("updated_at", { ascending: false })
    .limit(MAX_SUBSCRIPTIONS);
  if (error) {
    logger.error({ code: error.code }, "push_subscription_list_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok((data ?? []) as StoredPushSubscription[]);
}

/** Drops subscriptions the push service reported as gone (404/410). */
export async function deleteExpiredPushSubscriptions(endpoints: readonly string[]): Promise<void> {
  if (endpoints.length === 0) return;
  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("push_subscriptions")
    .delete()
    .in("endpoint", endpoints);
  if (error) {
    logger.warn({ code: error.code, count: endpoints.length }, "push_subscription_prune_failed");
  }
}
