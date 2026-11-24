import { describe, expect, it } from "vitest";

import {
  PUSH_FRESHNESS_MS,
  buildPushPayload,
  isFreshForPush,
  pushSubscriptionSchema,
} from "@/features/admin-notifications/domain/push";

describe("buildPushPayload", () => {
  it("carries title, body, link and uses the row id as tag", () => {
    expect(
      buildPushPayload({ id: "n1", title: "Yeni sipariş — A1", body: "Ali · Kargo", link: "/orders/1" }),
    ).toEqual({ title: "Yeni sipariş — A1", body: "Ali · Kargo", link: "/orders/1", tag: "n1" });
  });

  it.each(["https://evil.example/x", "//evil.example/x", "javascript:alert(1)", ""])(
    "falls back to /admin for a non-relative link %j",
    (link) => {
      expect(buildPushPayload({ id: "n", title: "t", body: "b", link }).link).toBe("/admin");
    },
  );
});

describe("isFreshForPush", () => {
  const now = new Date("2026-11-24T12:00:00Z");

  it("is fresh right after creation and at the limit", () => {
    expect(isFreshForPush("2026-11-24T11:59:59Z", now)).toBe(true);
    expect(isFreshForPush(new Date(now.getTime() - PUSH_FRESHNESS_MS).toISOString(), now)).toBe(true);
  });

  it("is stale past the limit", () => {
    expect(isFreshForPush(new Date(now.getTime() - PUSH_FRESHNESS_MS - 1).toISOString(), now)).toBe(false);
  });

  it("treats an unparsable timestamp as stale", () => {
    expect(isFreshForPush("not a date", now)).toBe(false);
  });
});

describe("pushSubscriptionSchema", () => {
  const valid = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "BNc...", auth: "tB..." },
  };

  it("accepts a browser PushSubscription.toJSON()", () => {
    expect(pushSubscriptionSchema.safeParse({ ...valid, expirationTime: null }).success).toBe(true);
  });

  it("rejects a non-https endpoint and missing keys", () => {
    expect(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "http://x.example/a" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: valid.endpoint }).success).toBe(false);
  });
});
