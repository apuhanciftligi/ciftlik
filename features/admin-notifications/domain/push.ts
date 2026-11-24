/**
 * Web Push for the admin notification feed: every bell row (new order,
 * recurring request, due reminder) is also sent to each browser / phone app
 * an admin turned notifications on for.
 *
 * Pure rules only — the claim/send/subscription plumbing lives in
 * application/dispatch-push.ts and infrastructure/.
 */
import { z } from "zod";

import type { AdminNotification } from "@/features/admin-notifications/domain/notification";

/** A bell row older than this when the sender first sees it is not pushed:
 *  a "new order" buzz half an hour late is noise, and it guards against a
 *  backlog (push switched off for a while, deploy window) arriving at once. */
export const PUSH_FRESHNESS_MS = 15 * 60_000;

/** How long the push service keeps trying to reach a phone that is off. */
export const PUSH_TTL_SECONDS = 6 * 60 * 60;

/** What the service worker (public/admin-sw.js) receives and shows. */
export interface PushPayload {
  readonly title: string;
  readonly body: string;
  /** App-relative path opened when the notification is tapped. */
  readonly link: string;
  /** Same tag = the newer notification replaces the older one on the phone. */
  readonly tag: string;
}

/** The browser's PushSubscription.toJSON(), as the client sends it. */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine((value) => value.startsWith("https://"), "Push adresi https olmalı."),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushEndpointSchema = pushSubscriptionSchema.shape.endpoint;

/** Only same-site paths: a link is opened by the service worker, never an
 *  absolute URL or a protocol-relative "//host". */
function safeLink(link: string): string {
  return link.startsWith("/") && !link.startsWith("//") ? link : "/admin";
}

export function buildPushPayload(
  notification: Pick<AdminNotification, "id" | "title" | "body" | "link">,
): PushPayload {
  return {
    title: notification.title,
    body: notification.body,
    link: safeLink(notification.link),
    tag: notification.id,
  };
}

export function isFreshForPush(createdAt: string, now: Date): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now.getTime() - created <= PUSH_FRESHNESS_MS;
}
