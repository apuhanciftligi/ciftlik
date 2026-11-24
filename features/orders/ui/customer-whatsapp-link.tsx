/**
 * Small WhatsApp icon next to a customer's name in the order list (grid and
 * phone cards): opens a chat with the customer's number. Renders nothing when
 * no phone is on file. Stops the click so tapping it never also opens the
 * order's detail sheet.
 */
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { buildWhatsAppLink } from "@/shared/utils/whatsapp";

interface CustomerWhatsAppLinkProps {
  readonly phone: string | null;
  readonly customerName: string;
}

export function CustomerWhatsAppLink({ phone, customerName }: CustomerWhatsAppLinkProps) {
  if (!phone) return null;
  return (
    <a
      href={buildWhatsAppLink(phone)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      aria-label={`${customerName} ile WhatsApp'ta yazış`}
      title="WhatsApp'tan yaz"
      // 32px hit area around a 16px glyph: easy to hit with a thumb in the
      // phone cards, still compact in a grid row.
      className="-my-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#1DA851] hover:bg-[#25D366]/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <WhatsAppIcon className="size-4" />
    </a>
  );
}
