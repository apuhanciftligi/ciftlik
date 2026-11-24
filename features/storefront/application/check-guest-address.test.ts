/**
 * The guest checkout's address check must answer exactly what the submit will
 * decide: same validation, same form shape, same upgrade rule.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Loaded by the real module below (for isOutsideServiceArea); never called.
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/features/storefront/infrastructure/service-area.repository", () => ({
  checkServiceArea: vi.fn(),
}));

const validateCheckoutAddress = vi.fn();
vi.mock("@/features/storefront/application/validate-checkout-address", async () => {
  // isOutsideServiceArea is a pure read of the error's tag — kept real so the
  // tag the validator sets and the flag the form reads cannot drift apart.
  const actual = await vi.importActual<
    typeof import("@/features/storefront/application/validate-checkout-address")
  >("@/features/storefront/application/validate-checkout-address");
  return {
    isOutsideServiceArea: actual.isOutsideServiceArea,
    validateCheckoutAddress: (...a: unknown[]) => validateCheckoutAddress(...a),
  };
});

const { checkGuestAddressAction } = await import(
  "@/features/storefront/application/check-guest-address"
);

const ADDRESS = {
  label: null,
  city: "Malatya",
  district: "Battalgazi",
  neighborhood: "Çamurlu",
  street: "Atatürk Cd.",
  building_no: "12",
  apartment_no: "3",
  postal_code: "",
  description: null,
  lat: 38.35,
  lng: 38.31,
  source: "user_pin",
  accuracy: "rooftop",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkGuestAddressAction", () => {
  it("validates against the form shape the checkout sent", async () => {
    validateCheckoutAddress.mockResolvedValue({
      ok: true,
      value: { address: ADDRESS, geoVerified: true },
    });

    await checkGuestAddressAction("cargo", { city: "Malatya" });

    expect(validateCheckoutAddress).toHaveBeenCalledWith("cargo", { city: "Malatya" });
  });

  it("upgrades an address inside the area with door detail", async () => {
    validateCheckoutAddress.mockResolvedValue({
      ok: true,
      value: { address: ADDRESS, geoVerified: true },
    });

    expect(await checkGuestAddressAction("cargo", {})).toEqual({
      status: "ok",
      routeUpgrade: true,
    });
  });

  it("does not upgrade an address the area check did not verify", async () => {
    validateCheckoutAddress.mockResolvedValue({
      ok: true,
      value: { address: ADDRESS, geoVerified: false },
    });

    expect(await checkGuestAddressAction("cargo", {})).toEqual({
      status: "ok",
      routeUpgrade: false,
    });
  });

  it("does not upgrade an address with no apartment number", async () => {
    validateCheckoutAddress.mockResolvedValue({
      ok: true,
      value: { address: { ...ADDRESS, apartment_no: "" }, geoVerified: true },
    });

    expect(await checkGuestAddressAction("cargo", {})).toEqual({
      status: "ok",
      routeUpgrade: false,
    });
  });

  it("passes the validation message through", async () => {
    validateCheckoutAddress.mockResolvedValue({
      ok: false,
      error: { message: "Daire no gerekli." },
    });

    expect(await checkGuestAddressAction("route", {})).toEqual({
      status: "invalid",
      message: "Daire no gerekli.",
      outsideArea: false,
    });
  });

  // The form shows this one in place of "Konum onaylandı. Kurye bu noktaya
  // gelecek." instead of beside it.
  it("flags a refusal for where the pin is", async () => {
    validateCheckoutAddress.mockResolvedValue({
      ok: false,
      error: {
        message: "Bu adres teslimat bölgemizin dışında.",
        details: { reason: "outside_service_area" },
      },
    });

    expect(await checkGuestAddressAction("route", {})).toEqual({
      status: "invalid",
      message: "Bu adres teslimat bölgemizin dışında.",
      outsideArea: true,
    });
  });

  it("refuses an unknown form shape without validating", async () => {
    expect(await checkGuestAddressAction("van", {})).toEqual({
      status: "invalid",
      message: "Adres bilgileri eksik.",
      outsideArea: false,
    });
    expect(validateCheckoutAddress).not.toHaveBeenCalled();
  });
});
