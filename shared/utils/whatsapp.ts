/**
 * WhatsApp click-to-chat links (wa.me). The single builder every feature uses:
 * the storefront's support/havale links, the driver's delivery message and the
 * admin panel's customer + payment-reminder links.
 *
 * wa.me wants the number as digits only (no "+", spaces or dashes); phones are
 * stored as E.164 (+90...), so this just strips the punctuation. `text`
 * pre-fills the message box — WhatsApp opens with it, the person still has to
 * press send. No WhatsApp Business API involved.
 */

/** `message` omitted opens WhatsApp with an empty composer. */
export function buildWhatsAppLink(phoneE164: string, message?: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return message
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${digits}`;
}
