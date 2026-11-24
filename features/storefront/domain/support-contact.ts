/**
 * Owner's WhatsApp contact — single source for every WhatsApp link the
 * storefront builds. `bank-transfer.ts` (the havale receipt link) and the
 * site-wide support button both read the number from here so it is never
 * duplicated, and a future number change is a one-line edit.
 */

/** E.164; buildWhatsAppLink strips it to the digits WhatsApp expects. */
export const SUPPORT_WHATSAPP_E164 = "+905332556444";

/** Re-exported so storefront callers keep one import for number + link. */
export { buildWhatsAppLink } from "@/shared/utils/whatsapp";
