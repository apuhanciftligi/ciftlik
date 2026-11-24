import "server-only";

/**
 * Sends every not-yet-pushed bell row to every admin push subscription.
 *
 * Whoever wrote the row — the order flow, the PayTR webhook, the recurring
 * request, or the database's due-reminder function — calls
 * schedulePushDispatch() afterwards; the claim in
 * claimPendingPushNotifications() makes overlapping calls safe, and a call
 * that finds nothing pending costs one indexed query.
 *
 * Best-effort, like the admin e-mail: never throws, never blocks the flow that
 * created the notification (it runs after the response via `after()`).
 */
import { after } from "next/server";

import {
  PUSH_TTL_SECONDS,
  buildPushPayload,
  isFreshForPush,
} from "@/features/admin-notifications/domain/push";
import { claimPendingPushNotifications } from "@/features/admin-notifications/infrastructure/notifications.repository";
import {
  deleteExpiredPushSubscriptions,
  listAllPushSubscriptions,
} from "@/features/admin-notifications/infrastructure/push-subscriptions.repository";
import {
  isWebPushConfigured,
  sendWebPush,
} from "@/features/admin-notifications/infrastructure/web-push.client";
import { logger } from "@/shared/logger";

/** Rows claimed per call; a burst bigger than this is picked up by the next call. */
const CLAIM_LIMIT = 20;

export async function dispatchPendingPushNotifications(): Promise<void> {
  if (!isWebPushConfigured()) return;
  try {
    const claimed = await claimPendingPushNotifications(CLAIM_LIMIT);
    if (!claimed.ok) return;

    const now = new Date();
    const fresh = claimed.value.filter((row) => isFreshForPush(row.createdAt, now));
    if (fresh.length === 0) return;

    const subscriptions = await listAllPushSubscriptions();
    if (!subscriptions.ok || subscriptions.value.length === 0) return;

    const sends = fresh.flatMap((row) =>
      subscriptions.value.map(async (subscription) => ({
        endpoint: subscription.endpoint,
        ...(await sendWebPush(subscription, buildPushPayload(row), PUSH_TTL_SECONDS)),
      })),
    );
    const results = await Promise.all(sends);

    const gone = [...new Set(results.filter((r) => r.outcome === "gone").map((r) => r.endpoint))];
    await deleteExpiredPushSubscriptions(gone);

    const failed = results.filter((r) => r.outcome === "failed");
    if (failed.length > 0) {
      logger.warn(
        { failed: failed.length, statusCodes: failed.map((r) => r.statusCode ?? null) },
        "push_send_partial_failure",
      );
    }
    logger.info(
      { notifications: fresh.length, sent: results.length - failed.length - gone.length, gone: gone.length },
      "push_dispatched",
    );
  } catch (error) {
    logger.error({ err: error }, "push_dispatch_failed");
  }
}

/** Runs the dispatch after the current response has been sent. Callers
 *  promise never to throw, so outside a request (where `after` is not
 *  available) it simply runs now in the background. */
export function schedulePushDispatch(): void {
  try {
    after(() => dispatchPendingPushNotifications());
  } catch {
    void dispatchPendingPushNotifications();
  }
}
