"use client";

/**
 * Site-wide floating WhatsApp support button. Unlike the havale receipt link
 * in checkout, this one is not tied to an order — it's just "reach us",
 * available on every storefront page via the shop layout.
 *
 * Except the checkout form itself (`/odeme`, owner decision 2026-10-20): there
 * it floated over the form's red field messages on a phone, and the page
 * already leads with its own "WhatsApp'tan sipariş ver", which carries the
 * basket. The payment result pages (`/odeme/basarili`, `/odeme/basarisiz`)
 * keep it — a failed payment is exactly when help is wanted. A Client
 * Component only for `usePathname`.
 */
import { usePathname } from "next/navigation";

import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import {
  buildWhatsAppLink,
  SUPPORT_WHATSAPP_E164,
} from "@/features/storefront/domain/support-contact";

/**
 * Dark label on WhatsApp green: white on #25D366 is under 2:1, the shop's own
 * dark brown on it is ~8.6:1.
 *
 * Phone: a labelled pill ("Yardım") above the dock — an unlabelled green
 * circle is a logo to an older shopper, not an offer of help.
 *
 * Desktop: a 56px circle that opens to the full "WhatsApp'tan yazın" pill on
 * hover or keyboard focus. As a permanent pill it sat ON the page — over the
 * right-hand product card, the order summary and the footer text — because
 * the content column leaves only ~64px of margin at common laptop widths.
 * From 1600px up there is room beside the content, so the label stays open.
 */
export function WhatsAppSupportButton() {
  const pathname = usePathname();
  if (pathname === "/odeme") return null;
  return (
    <a
      href={buildWhatsAppLink(
        SUPPORT_WHATSAPP_E164,
        "Merhabalar, Apuhan Çiftliği hakkında iletişime geçiyorum.",
      )}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp'tan yardım alın"
      title="WhatsApp'tan yazın"
      className="group shop-press shop-focus fixed right-3 bottom-[calc(var(--shop-dock)+0.75rem)] z-50 flex h-12 items-center gap-2 rounded-full bg-[#25D366] px-3 text-foreground shadow-(--shop-shadow-md) sm:right-5 sm:bottom-5 sm:h-14 sm:px-3.5"
    >
      <WhatsAppIcon className="size-7 shrink-0" />
      <span className="pr-1 text-base font-bold whitespace-nowrap sm:hidden">Yardım</span>
      <span className="hidden pr-1.5 text-base font-bold whitespace-nowrap sm:group-hover:inline sm:group-focus-visible:inline min-[1600px]:inline">
        WhatsApp&apos;tan yazın
      </span>
    </a>
  );
}
