"use client";

/**
 * "Bu cihaza bildirim gönder" switch inside the notification bell. Turning it
 * on asks for notification permission (in the Android app: the app's own
 * permission dialog), subscribes this browser/app through the admin service
 * worker and stores the subscription; the server answers with a confirmation
 * push. Turning it off drops the subscription on both sides.
 *
 * The state is per device: each phone or computer is switched separately.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  subscribePushAction,
  unsubscribePushAction,
} from "@/features/admin-notifications/application/push-subscription-actions";
import { Switch } from "@/components/ui/switch";
import { getActiveAdminServiceWorker } from "@/shared/pwa/admin-service-worker";

type PushState = "loading" | "unsupported" | "denied" | "off" | "on";

interface PushToggleProps {
  /** NEXT_PUBLIC_VAPID_PUBLIC_KEY; null = push not configured on the server. */
  readonly publicKey: string | null;
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** VAPID public key (base64url) → the bytes pushManager.subscribe() wants. */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

async function readPushState(publicKey: string | null): Promise<PushState> {
  if (!publicKey || !isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const subscription = await currentSubscription();
    return subscription && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "off";
  }
}

export function PushToggle({ publicKey }: PushToggleProps) {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readPushState(publicKey).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  if (state === "unsupported" || state === "loading" || !publicKey) return null;

  const turnOn = async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "denied" : "off");
      return;
    }
    const key = base64UrlToBytes(publicKey);
    const registration = await getActiveAdminServiceWorker();
    let subscription = await registration.pushManager.getSubscription();
    // A subscription made with an older server key would never receive anything.
    if (subscription && !sameKey(subscription, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    const result = await subscribePushAction(subscription.toJSON());
    if (!result.ok) {
      toast.error(`Bildirimler açılamadı: ${result.error.message}`);
      return;
    }
    setState("on");
    toast.success("Bildirimler bu cihazda açıldı.");
  };

  const turnOff = async () => {
    const subscription = await currentSubscription();
    if (subscription) {
      const result = await unsubscribePushAction(subscription.endpoint);
      if (!result.ok) {
        toast.error(`Bildirimler kapatılamadı: ${result.error.message}`);
        return;
      }
      await subscription.unsubscribe();
    }
    setState("off");
    toast.success("Bildirimler bu cihazda kapatıldı.");
  };

  const handleChange = async (checked: boolean) => {
    setBusy(true);
    try {
      await (checked ? turnOn() : turnOff());
    } catch {
      toast.error("Bildirim ayarı değiştirilemedi. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t px-2 py-2">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Bu cihaza bildirim gönder</span>
        <Switch
          checked={state === "on"}
          disabled={busy || state === "denied"}
          onCheckedChange={(checked) => void handleChange(checked)}
        />
      </label>
      {state === "denied" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Bildirim izni kapalı. Telefonun Ayarlar → Uygulamalar → Apuhan → Bildirimler bölümünden açın.
        </p>
      ) : null}
    </div>
  );
}
