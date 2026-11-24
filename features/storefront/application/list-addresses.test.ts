/**
 * Regression test: the address book must be scoped to the signed-in user, not
 * left to RLS. `addresses_admin_all` has no row filter, so an admin's /hesap
 * listed every customer's address. The mock records the query chain; the
 * load-bearing assertion is the owner filter.
 *
 * Follows the repo's mock-then-`await import()` pattern (see place-order.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const calls: Array<[string, ...unknown[]]> = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

function query(): unknown {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  // Awaiting the builder resolves the query, like supabase-js.
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return builder;
}

vi.mock("@/shared/supabase/server", () => ({
  // The client itself is not thenable (it is awaited); only the query is.
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      calls.push(["from", table]);
      return query();
    },
  }),
}));

const { listMyAddresses } = await import(
  "@/features/storefront/application/list-addresses"
);

describe("listMyAddresses", () => {
  beforeEach(() => {
    calls.length = 0;
    result = { data: [], error: null };
  });

  it("filters to the caller's own customer instead of trusting RLS", async () => {
    await listMyAddresses("auth-user-1");

    const select = calls.find(([m]) => m === "select");
    expect(select?.[1]).toContain("customers!inner(auth_user_id)");
    expect(calls).toContainEqual(["eq", "customers.auth_user_id", "auth-user-1"]);
  });

  it("maps rows and ignores the join column", async () => {
    result = {
      data: [
        {
          id: "a1",
          label: "Ev",
          city: "Malatya",
          district: "Yeşilyurt",
          neighborhood: "Bostanbaşı",
          street: "Çiftlik Cd.",
          building_no: "1",
          apartment_no: "2",
          postal_code: "44900",
          description: null,
          raw_text: "Çiftlik Cd. No: 1/2",
          lat: 38.3,
          lng: 38.25,
          accuracy: "rooftop",
          source: "user_pin",
          is_primary: true,
          geo_verified_at: "2026-11-24T10:00:00Z",
          customers: { auth_user_id: "auth-user-1" },
        },
      ],
      error: null,
    };

    const listed = await listMyAddresses("auth-user-1");

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]).toMatchObject({
      id: "a1",
      description: "",
      is_primary: true,
      geo_verified: true,
    });
    expect(listed.value[0]).not.toHaveProperty("customers");
  });

  it("returns an error result when the query fails", async () => {
    result = { data: null, error: { code: "42501", message: "denied" } };

    const listed = await listMyAddresses("auth-user-1");

    expect(listed.ok).toBe(false);
  });
});
