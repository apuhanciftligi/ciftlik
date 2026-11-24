/**
 * Customer auth Zod schemas — storefront sign-in / sign-up (email + password
 * via Supabase Auth). Parsed first thing in the auth Server Actions.
 */
import { z } from "zod";

import { isE164TR, normalizeTRPhone } from "@/shared/utils/phone";

/**
 * Required TR phone, normalized to E.164 — the same rule as checkout, so a
 * phone entered at signup/profile dedupes against a guest customer created
 * from a prior order. Required everywhere a customer can set it: a delivery
 * the driver cannot phone fails at the door, and phone is the field the CRM
 * and the route readiness check key on. A missing form field reads as blank,
 * so it gets the same "Telefon gerekli." as an empty one.
 */
const requiredPhoneTR = z.preprocess(
  (v) => v ?? "",
  z
    .string()
    .trim()
    .min(1, "Telefon gerekli.")
    .transform((s, ctx) => {
      const normalized = normalizeTRPhone(s);
      if (normalized === null || !isE164TR(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Geçerli bir telefon girin (ör. 0532 123 45 67).",
        });
        return z.NEVER;
      }
      return normalized;
    }),
);

export const customerSignInSchema = z.object({
  email: z
    .string()
    .min(1, "E-posta gerekli.")
    .email("Geçerli bir e-posta girin.")
    .toLowerCase(),
  password: z.string().min(1, "Şifre gerekli."),
});

export const customerSignUpSchema = z.object({
  email: z
    .string()
    .min(1, "E-posta gerekli.")
    .email("Geçerli bir e-posta girin.")
    .toLowerCase(),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı."),
  first_name: z.string().trim().min(1, "Ad gerekli.").max(100),
  last_name: z.string().trim().min(1, "Soyad gerekli.").max(100),
  // The same rule applies to the inline signup at checkout.
  phone: requiredPhoneTR,
});

/**
 * Account "Bilgilerim" editor — name and phone required (E.164). The phone used
 * to be optional here, which let a customer blank it and then order with no
 * number for the driver to call.
 */
export const customerProfileSchema = z.object({
  first_name: z.string().trim().min(1, "Ad gerekli.").max(100),
  last_name: z.string().trim().min(1, "Soyad gerekli.").max(100),
  phone: requiredPhoneTR,
});

export type CustomerProfileInput = z.input<typeof customerProfileSchema>;

/** "Forgot password" — request a reset link by email. */
export const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .min(1, "E-posta gerekli.")
    .email("Geçerli bir e-posta girin.")
    .toLowerCase(),
});

/** Set a new password (from the recovery-link session). */
export const passwordUpdateSchema = z.object({
  password: z.string().min(8, "Şifre en az 8 karakter olmalı."),
});

export type CustomerSignInInput = z.input<typeof customerSignInSchema>;
export type CustomerSignUpInput = z.input<typeof customerSignUpSchema>;
export type PasswordResetRequestInput = z.input<typeof passwordResetRequestSchema>;
export type PasswordUpdateInput = z.input<typeof passwordUpdateSchema>;
