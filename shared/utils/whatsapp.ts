/**
 * WhatsApp click-to-chat links. The single builder every feature uses: the
 * storefront's support/havale links, the driver's delivery message and the
 * admin panel's customer + payment-reminder links.
 *
 * Uses WhatsApp's own `api.whatsapp.com/send?phone=…&text=…` endpoint rather
 * than the `wa.me/<n>?text=` short form: with the short form the payment
 * reminder's emoji (🐓, 🙏🏻) arrived in WhatsApp as "?" on the owner's phone
 * (2026-11-24). wa.me only redirects to this same endpoint, so the chat it
 * opens is identical.
 *
 * The number goes in as digits only (no "+", spaces or dashes); phones are
 * stored as E.164 (+90...), so this just strips the punctuation. `text`
 * pre-fills the message box — WhatsApp opens with it, the person still has to
 * press send. No WhatsApp Business API involved.
 */

/** `message` omitted opens WhatsApp with an empty composer. */
export function buildWhatsAppLink(phoneE164: string, message?: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  const base = `https://api.whatsapp.com/send?phone=${digits}`;
  return message ? `${base}&text=${encodeURIComponent(message)}` : base;
}
