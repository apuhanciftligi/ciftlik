import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));

const claimPendingPushNotifications = vi.fn();
vi.mock("@/features/admin-notifications/infrastructure/notifications.repository", () => ({
  claimPendingPushNotifications: (...a: unknown[]) => claimPendingPushNotifications(...a),
}));

const listAllPushSubscriptions = vi.fn();
const deleteExpiredPushSubscriptions = vi.fn();
vi.mock("@/features/admin-notifications/infrastructure/push-subscriptions.repository", () => ({
  listAllPushSubscriptions: () => listAllPushSubscriptions(),
  deleteExpiredPushSubscriptions: (...a: unknown[]) => deleteExpiredPushSubscriptions(...a),
}));

const isWebPushConfigured = vi.fn();
const sendWebPush = vi.fn();
vi.mock("@/features/admin-notifications/infrastructure/web-push.client", () => ({
  isWebPushConfigured: () => isWebPushConfigured(),
  sendWebPush: (...a: unknown[]) => sendWebPush(...a),
}));

vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { dispatchPendingPushNotifications } from "@/features/admin-notifications/application/dispatch-push";

const phone = { endpoint: "https://fcm.googleapis.com/a", p256dh: "p", auth: "a" };
const laptop = { endpoint: "https://fcm.googleapis.com/b", p256dh: "p", auth: "a" };

function row(id: string, ageMs: number) {
  return {
    id,
    title: `t-${id}`,
    body: "b",
    link: "/orders/1",
    createdAt: new Date(Date.now() - ageMs).toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isWebPushConfigured.mockReturnValue(true);
  listAllPushSubscriptions.mockResolvedValue({ ok: true, value: [phone, laptop] });
  sendWebPush.mockResolvedValue({ outcome: "sent" });
});

describe("dispatchPendingPushNotifications", () => {
  it("does nothing when push is not configured", async () => {
    isWebPushConfigured.mockReturnValue(false);
    await dispatchPendingPushNotifications();
    expect(claimPendingPushNotifications).not.toHaveBeenCalled();
  });

  it("sends each fresh row to every subscription and skips stale ones", async () => {
    claimPendingPushNotifications.mockResolvedValue({
      ok: true,
      value: [row("new", 1000), row("old", 60 * 60_000)],
    });
    await dispatchPendingPushNotifications();
    expect(sendWebPush).toHaveBeenCalledTimes(2);
    for (const call of sendWebPush.mock.calls) {
      expect(call[1]).toMatchObject({ title: "t-new", tag: "new", link: "/orders/1" });
    }
    expect(deleteExpiredPushSubscriptions).toHaveBeenCalledWith([]);
  });

  it("prunes subscriptions the push service reports as gone", async () => {
    claimPendingPushNotifications.mockResolvedValue({ ok: true, value: [row("a", 0), row("b", 0)] });
    sendWebPush.mockImplementation(async (sub: { endpoint: string }) =>
      sub.endpoint === phone.endpoint ? { outcome: "gone", statusCode: 410 } : { outcome: "sent" },
    );
    await dispatchPendingPushNotifications();
    expect(deleteExpiredPushSubscriptions).toHaveBeenCalledWith([phone.endpoint]);
  });

  it("does not read subscriptions when nothing fresh was claimed", async () => {
    claimPendingPushNotifications.mockResolvedValue({ ok: true, value: [] });
    await dispatchPendingPushNotifications();
    expect(listAllPushSubscriptions).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    claimPendingPushNotifications.mockRejectedValue(new Error("boom"));
    await expect(dispatchPendingPushNotifications()).resolves.toBeUndefined();
  });
});
