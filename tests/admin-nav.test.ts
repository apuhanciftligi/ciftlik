import { describe, expect, it } from "vitest";

import { menuGroups, navItems, settingsItems, tabBarItems } from "@/app/(admin)/_components/admin-nav";

describe("admin phone menu", () => {
  // Faturalar was once added to the desktop sidebar only and never showed up
  // on the phone. Every page in the sidebar must be reachable from the menu.
  it("lists every sidebar page exactly once", () => {
    const menuHrefs = [...menuGroups.flatMap((group) => group.items), ...settingsItems].map(
      (item) => item.href,
    );

    expect([...menuHrefs].sort()).toEqual(navItems.map((item) => item.href).sort());
  });

  it("shows Faturalar under Kayıtlar", () => {
    const kayitlar = menuGroups.find((group) => group.title === "Kayıtlar");
    expect(kayitlar?.items.map((item) => item.href)).toContain("/faturalar");
  });

  it("keeps no empty group and pins only menu pages to the tab bar", () => {
    expect(menuGroups.every((group) => group.items.length > 0)).toBe(true);
    for (const item of tabBarItems) expect(navItems).toContain(item);
  });
});
