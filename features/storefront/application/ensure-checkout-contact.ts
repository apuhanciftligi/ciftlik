import "server-only";

/**
 * Make sure a signed-in customer's order goes out with a name and a phone.
 *
 * A guest types both into the order form and the schema refuses an order
 * without them. A signed-in customer did not: identity came from the account,
 * and the account could lack a phone — "Bilgilerim" used to let it be blanked,
 * and older or admin-made logins never had one. Such an order reached the van
 * with no number for the driver to call.
 *
 * The checkout now asks for exactly what the profile is missing
 * (`missingContactFields`, the same rule the form uses). This fills those
 * fields from what was typed, saves them to the account (so the next order
 * does not ask again), and refuses the order if anything is still missing.
 *
 * Each field is taken, in order, from:
 *   1. the linked `customers` row — what the order is written against and what
 *      the driver sees. A field it already holds is never overwritten from the
 *      form: the checkout shows no input for it.
 *   2. what was typed — the checkout shows an input exactly when the account
 *      page's value (row, else session metadata; see get-account.ts) is unusable.
 *   3. the session's `user_metadata` — the signup copy, which is what the
 *      account page fell back to when it showed no input.
 * Whatever the row lacked is then written back to it.
 */
import { saveCustomerProfile } from "@/features/storefront/application/save-profile";
import {
  missingContactFields,
  type OrderContact,
} from "@/features/storefront/domain/checkout-missing";
import { findCustomerContact } from "@/features/storefront/infrastructure/customer-account.repository";
import { ValidationError, type AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";
import { normalizeTRPhone } from "@/shared/utils/phone";

export interface CheckoutContact {
  firstName: string;
  lastName: string;
  /** E.164. */
  phone: string;
}

export const MISSING_CONTACT_MESSAGE =
  "Siparişi tamamlamak için adınızı, soyadınızı ve telefonunuzu yazın. Kuryemiz size bu numaradan ulaşır.";

export async function ensureCheckoutContact(
  /** The checkout session: who is ordering, plus their signup metadata. */
  session: { authUserId: string } & OrderContact,
  /** What the account checkout's contact fields held; null/undefined = not sent. */
  typed: {
    first_name?: string | null | undefined;
    last_name?: string | null | undefined;
    phone?: string | null | undefined;
  },
): Promise<Result<CheckoutContact, AppError>> {
  const row = await findCustomerContact(session.authUserId);
  if (!row.ok) return row;

  const saved: OrderContact = row.value ?? { firstName: null, lastName: null, phone: null };
  const missing = new Set(missingContactFields(saved));
  const metaMissing = new Set(missingContactFields(session));
  const pick = (
    field: "first_name" | "last_name" | "phone",
    fromRow: string | null,
    fromForm: string | null | undefined,
    fromMeta: string | null,
  ): string | null =>
    !missing.has(field) ? fromRow : (fromForm ?? (metaMissing.has(field) ? null : fromMeta));

  const firstName = pick("first_name", saved.firstName, typed.first_name, session.firstName);
  const lastName = pick("last_name", saved.lastName, typed.last_name, session.lastName);
  const rawPhone = pick("phone", saved.phone, typed.phone, session.phone);
  const phone = rawPhone === null ? null : normalizeTRPhone(rawPhone);

  if (
    firstName === null ||
    lastName === null ||
    phone === null ||
    missingContactFields({ firstName, lastName, phone }).length > 0
  ) {
    return err(new ValidationError({ message: MISSING_CONTACT_MESSAGE }));
  }

  const contact: CheckoutContact = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone,
  };

  if (missing.size > 0) {
    // P0003 (number already on another account) comes back as a
    // ValidationError with its own sentence; the caller shows it as-is.
    const savedProfile = await saveCustomerProfile({
      authUserId: session.authUserId,
      ...contact,
    });
    if (!savedProfile.ok) return savedProfile;
  }

  return ok(contact);
}
