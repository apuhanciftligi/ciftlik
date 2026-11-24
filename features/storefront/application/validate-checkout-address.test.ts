/**
 * Only the tag that tells "outside the area the van serves" apart from a bad
 * field. The checkout shows that one in place of "Konum onaylandı. Kurye bu
 * noktaya gelecek." — beside it, the two read as the site contradicting itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const checkServiceArea = vi.fn();
vi.mock("@/features/storefront/infrastructure/service-area.repository", () => ({
  checkServiceArea: (...a: unknown[]) => checkServiceArea(...a),
}));

const { isOutsideServiceArea, validateCheckoutAddress } = await import(
  "@/features/storefront/application/validate-checkout-address"
);

const ROUTE_ADDRESS = {
  label: "",
  city: "Malatya",
  district: "Battalgazi",
  neighborhood: "Fırat",
  street: "19. Sk.",
  building_no: "39",
  apartment_no: "3",
  postal_code: "",
  description: "",
  lat: 38.34,
  lng: 38.33,
  source: "user_pin",
  accuracy: "rooftop",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateCheckoutAddress — outside the service area", () => {
  it("tags a pin the area check puts outside", async () => {
    checkServiceArea.mockResolvedValue({ ok: true, value: "outside" });

    const result = await validateCheckoutAddress("route", ROUTE_ADDRESS);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(isOutsideServiceArea(result.error)).toBe(true);
  });

  it("tags another province when the area check is unavailable", async () => {
    checkServiceArea.mockResolvedValue({ ok: false, error: { code: "EXTERNAL_API_ERROR" } });

    const result = await validateCheckoutAddress("route", { ...ROUTE_ADDRESS, city: "İstanbul" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(isOutsideServiceArea(result.error)).toBe(true);
  });

  it("does not tag a missing field", async () => {
    const result = await validateCheckoutAddress("route", { ...ROUTE_ADDRESS, street: "" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(isOutsideServiceArea(result.error)).toBe(false);
    expect(checkServiceArea).not.toHaveBeenCalled();
  });

  it("accepts a pin inside the area", async () => {
    checkServiceArea.mockResolvedValue({ ok: true, value: "inside" });

    const result = await validateCheckoutAddress("route", ROUTE_ADDRESS);

    expect(result.ok).toBe(true);
  });
});
