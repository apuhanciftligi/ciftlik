import "server-only";

/**
 * Save a signed-in customer's name and phone — the one writer behind both
 * "Bilgilerim" (update-profile.ts) and the checkout, which asks a customer
 * whose profile lacks them before the order goes (ensure-checkout-contact.ts).
 *
 * Two copies are written because two readers exist: the `customers` row is the
 * authoritative record (the order is written against it, the driver reads it),
 * and `user_metadata` is what the checkout session is built from
 * (checkout-account.ts) — the stale copy there is what would otherwise be
 * handed to PayTR (`place-order.ts`, `userPhone`).
 */
import { updateCustomerProfile } from "@/features/storefront/infrastructure/customer-account.repository";
import type { AppError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface SaveCustomerProfileInput {
  authUserId: string;
  firstName: string;
  lastName: string;
  /** E.164, already normalised. */
  phone: string;
}

export async function saveCustomerProfile(
  input: SaveCustomerProfileInput,
): Promise<Result<void, AppError>> {
  const saved = await updateCustomerProfile(input);
  if (!saved.ok) return saved;

  // Best-effort: the authoritative record is already saved, so a failure here
  // must not report the edit as failed. It is logged rather than swallowed
  // (CLAUDE.md §5).
  const supabase = await createSupabaseServerClient();
  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
    },
  });
  if (metadataError) {
    logger.warn(
      { supabaseStatus: metadataError.status, code: metadataError.code },
      "customer_profile_metadata_sync_failed",
    );
  }
  return ok(undefined);
}
