"use server";

/**
 * "Bildirimleri aç / kapat" in the notification bell. The browser creates the
 * subscription (service worker + VAPID public key); these actions store or
 * drop it. Turning on also sends one confirmation push straight to the new
 * subscription, so the admin sees end to end — server, push service, phone —
 * that it works.
 */
import { headers } from "next/headers";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  buildPushPayload,
  pushEndpointSchema,
  pushSubscriptionSchema,
} from "@/features/admin-notifications/domain/push";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/features/admin-notifications/infrastructure/push-subscriptions.repository";
import {
  isWebPushConfigured,
  sendWebPush,
} from "@/features/admin-notifications/infrastructure/web-push.client";
import { AppError, ExternalApiError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

/** The confirmation is only useful right now; don't deliver it hours later. */
const CONFIRMATION_TTL_SECONDS = 60;

export async function subscribePushAction(raw: unknown): Promise<Result<void, AppError>> {
  const parsed = pushSubscriptionSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz bildirim aboneliği.", details: parsed.error.flatten() }));
  }
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  if (!isWebPushConfigured()) {
    return err(new ExternalApiError({ message: "Push bildirimleri sunucuda ayarlı değil." }));
  }

  const userAgent = (await headers()).get("user-agent")?.slice(0, 400) ?? null;
  const saved = await savePushSubscription({
    userId: auth.value.id,
    subscription: parsed.data,
    userAgent,
  });
  if (!saved.ok) return err(saved.error);

  const sent = await sendWebPush(
    {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    buildPushPayload({
      id: "push-enabled",
      title: "Bildirimler açık",
      body: "Yeni sipariş, düzenli sipariş talebi ve anımsatıcılar bu cihaza gelecek.",
      link: "/admin",
    }),
    CONFIRMATION_TTL_SECONDS,
  );
  if (sent.outcome !== "sent") {
    logger.warn({ outcome: sent.outcome, statusCode: sent.statusCode ?? null }, "push_confirmation_failed");
    return err(new ExternalApiError({ message: "Deneme bildirimi gönderilemedi." }));
  }
  return ok(undefined);
}

export async function unsubscribePushAction(rawEndpoint: unknown): Promise<Result<void, AppError>> {
  const parsed = pushEndpointSchema.safeParse(rawEndpoint);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz bildirim adresi." }));
  }
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  return removePushSubscription(parsed.data);
}
