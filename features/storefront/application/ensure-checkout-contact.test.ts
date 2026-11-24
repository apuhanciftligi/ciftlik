/**
 * A signed-in customer's order must leave with a name and a phone the driver
 * can call. These pin down where each field comes from and when the account is
 * written to.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findCustomerContact = vi.fn();
vi.mock("@/features/storefront/infrastructure/customer-account.repository", () => ({
  findCustomerContact: (...a: unknown[]) => findCustomerContact(...a),
}));

const saveCustomerProfile = vi.fn();
vi.mock("@/features/storefront/application/save-profile", () => ({
  saveCustomerProfile: (...a: unknown[]) => saveCustomerProfile(...a),
}));

const { ensureCheckoutContact, MISSING_CONTACT_MESSAGE } = await import(
  "@/features/storefront/application/ensure-checkout-contact"
);

const COMPLETE_ROW = { firstName: "Ayşe", lastName: "Yılmaz", phone: "+905321234567" };
const EMPTY_SESSION = { authUserId: "auth-1", firstName: null, lastName: null, phone: null };

beforeEach(() => {
  vi.clearAllMocks();
  findCustomerContact.mockResolvedValue({ ok: true, value: COMPLETE_ROW });
  saveCustomerProfile.mockResolvedValue({ ok: true, value: undefined });
});

describe("ensureCheckoutContact", () => {
  it("uses a complete profile as it is, writing nothing", async () => {
    const result = await ensureCheckoutContact(EMPTY_SESSION, {});

    expect(result).toEqual({ ok: true, value: COMPLETE_ROW });
    expect(saveCustomerProfile).not.toHaveBeenCalled();
  });

  it("never overwrites a field the profile already holds", async () => {
    const result = await ensureCheckoutContact(EMPTY_SESSION, {
      first_name: "Başkası",
      phone: "+905559998877",
    });

    expect(result).toEqual({ ok: true, value: COMPLETE_ROW });
    expect(saveCustomerProfile).not.toHaveBeenCalled();
  });

  it("refuses when the profile has no phone and none was typed", async () => {
    findCustomerContact.mockResolvedValue({
      ok: true,
      value: { ...COMPLETE_ROW, phone: null },
    });

    const result = await ensureCheckoutContact(EMPTY_SESSION, {});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(MISSING_CONTACT_MESSAGE);
    expect(saveCustomerProfile).not.toHaveBeenCalled();
  });

  it("fills a missing phone from the checkout and saves it to the account", async () => {
    findCustomerContact.mockResolvedValue({
      ok: true,
      value: { ...COMPLETE_ROW, phone: null },
    });

    const result = await ensureCheckoutContact(EMPTY_SESSION, { phone: "+905321234567" });

    expect(result).toEqual({ ok: true, value: COMPLETE_ROW });
    expect(saveCustomerProfile).toHaveBeenCalledWith({ authUserId: "auth-1", ...COMPLETE_ROW });
  });

  // The account page shows the signup name when the CRM row has none, so the
  // checkout asked only for the phone; the name must come from the same place.
  it("falls back to the signup name the account page showed", async () => {
    findCustomerContact.mockResolvedValue({
      ok: true,
      value: { firstName: null, lastName: null, phone: null },
    });

    const result = await ensureCheckoutContact(
      { authUserId: "auth-1", firstName: "Ayşe", lastName: "Yılmaz", phone: null },
      { phone: "+905321234567" },
    );

    expect(result).toEqual({ ok: true, value: COMPLETE_ROW });
    expect(saveCustomerProfile).toHaveBeenCalledWith({ authUserId: "auth-1", ...COMPLETE_ROW });
  });

  it("prefers what was typed over the signup copy", async () => {
    findCustomerContact.mockResolvedValue({
      ok: true,
      value: { ...COMPLETE_ROW, firstName: "  " },
    });

    const result = await ensureCheckoutContact(
      { ...EMPTY_SESSION, firstName: "Eski" },
      { first_name: "Ayşe" },
    );

    expect(result).toEqual({ ok: true, value: COMPLETE_ROW });
  });

  it("treats an unusable stored phone as missing", async () => {
    findCustomerContact.mockResolvedValue({
      ok: true,
      value: { ...COMPLETE_ROW, phone: "123" },
    });

    const result = await ensureCheckoutContact(EMPTY_SESSION, {});

    expect(result.ok).toBe(false);
  });

  it("normalises a stored phone that is valid but not E.164", async () => {
    findCustomerContact.mockResolvedValue({
      ok: true,
      value: { ...COMPLETE_ROW, phone: "0532 123 45 67" },
    });

    const result = await ensureCheckoutContact(EMPTY_SESSION, {});

    expect(result).toEqual({ ok: true, value: COMPLETE_ROW });
    expect(saveCustomerProfile).not.toHaveBeenCalled();
  });

  it("passes on the account's refusal (number on another account)", async () => {
    findCustomerContact.mockResolvedValue({
      ok: true,
      value: { ...COMPLETE_ROW, phone: null },
    });
    const taken = { code: "VALIDATION_ERROR", message: "Bu telefon numarası başka bir hesapta kayıtlı." };
    saveCustomerProfile.mockResolvedValue({ ok: false, error: taken });

    const result = await ensureCheckoutContact(EMPTY_SESSION, { phone: "+905321234567" });

    expect(result).toEqual({ ok: false, error: taken });
  });

  it("passes on a failed read", async () => {
    const failure = { code: "EXTERNAL_API_ERROR", message: "db down" };
    findCustomerContact.mockResolvedValue({ ok: false, error: failure });

    expect(await ensureCheckoutContact(EMPTY_SESSION, {})).toEqual({ ok: false, error: failure });
  });
});
