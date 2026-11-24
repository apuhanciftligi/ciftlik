import "server-only";

/**
 * Thin wrapper over the `web-push` library (VAPID signing + RFC 8291 payload
 * encryption). The keys come from VAPID_PRIVATE_KEY /
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY; with either unset push is off.
 */
import webpush, { WebPushError } from "web-push";

import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";
import { env } from "@/shared/env";

import type { PushPayload } from "@/features/admin-notifications/domain/push";
import type { StoredPushSubscription } from "@/features/admin-notifications/infrastructure/push-subscriptions.repository";

export type WebPushOutcome = "sent" | "gone" | "failed";

/** Fails fast on a hanging push service instead of holding the request. */
const SEND_TIMEOUT_MS = 10_000;

export function isWebPushConfigured(): boolean {
  return Boolean(env.VAPID_PRIVATE_KEY && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

export async function sendWebPush(
  subscription: StoredPushSubscription,
  payload: PushPayload,
  ttlSeconds: number,
): Promise<{ outcome: WebPushOutcome; statusCode?: number }> {
  const privateKey = env.VAPID_PRIVATE_KEY;
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!privateKey || !publicKey) return { outcome: "failed" };

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      {
        vapidDetails: { subject: CANONICAL_ORIGIN, publicKey, privateKey },
        TTL: ttlSeconds,
        urgency: "high",
        timeout: SEND_TIMEOUT_MS,
      },
    );
    return { outcome: "sent" };
  } catch (error) {
    if (error instanceof WebPushError) {
      // 404/410: the browser/app dropped this subscription (uninstalled,
      // notifications turned off, site data cleared) — it will never work again.
      const gone = error.statusCode === 404 || error.statusCode === 410;
      return { outcome: gone ? "gone" : "failed", statusCode: error.statusCode };
    }
    return { outcome: "failed" };
  }
}
