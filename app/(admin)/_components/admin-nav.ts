import {
  CalendarDays,
  CalendarRange,
  FileText,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Images,
  Map,
  Megaphone,
  Package,
  PiggyBank,
  Repeat,
  Store,
  Tags,
  Truck,
  Users,
} from "lucide-react";

/**
 * Single source for the panel's destinations. The desktop sidebar, the phone
 * tab bar and the phone menu all read from here, so a new page shows up in the
 * sidebar and the phone menu (a new top-level section also goes in
 * shared/routes/admin-route-prefixes.ts — a test enforces it).
 */
export interface AdminNavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Active only on an exact path match (the dashboard would otherwise match everything). */
  readonly exact: boolean;
  /** Where the page sits in the phone menu. Required, so a new page cannot be
   *  left out of the phone menu (the way Faturalar once was). */
  readonly menuGroup: AdminMenuGroup;
}

/** Phone menu groups, in display order, grouped by the job being done. */
const MENU_GROUP_TITLES = ["Günlük iş", "Planlama", "Kayıtlar", "Satış"] as const;

/** "Ayarlar" is rendered separately, next to the text-size, theme and sign-out rows. */
type AdminMenuGroup = (typeof MENU_GROUP_TITLES)[number] | "Ayarlar";

const PANEL: AdminNavItem = { href: "/admin", label: "Panel", icon: LayoutDashboard, exact: true, menuGroup: "Günlük iş" };
const TAKVIM: AdminNavItem = { href: "/takvim", label: "Takvim", icon: CalendarDays, exact: false, menuGroup: "Planlama" };
const ANIMSATICILAR: AdminNavItem = { href: "/animsaticilar", label: "Anımsatıcılar", icon: ListChecks, exact: false, menuGroup: "Planlama" };
const MUSTERILER: AdminNavItem = { href: "/customers", label: "Müşteriler", icon: Users, exact: false, menuGroup: "Kayıtlar" };
const SIPARISLER: AdminNavItem = { href: "/orders", label: "Siparişler", icon: Package, exact: false, menuGroup: "Günlük iş" };
const TEKRARLANANLAR: AdminNavItem = { href: "/recurring", label: "Tekrarlananlar", icon: Repeat, exact: false, menuGroup: "Planlama" };
const URUNLER: AdminNavItem = { href: "/products", label: "Ürünler", icon: Tags, exact: false, menuGroup: "Kayıtlar" };
const HARITA: AdminNavItem = { href: "/map", label: "Harita", icon: Map, exact: false, menuGroup: "Kayıtlar" };
const ROTA: AdminNavItem = { href: "/routes", label: "Rota", icon: CalendarRange, exact: false, menuGroup: "Günlük iş" };
const KARGO: AdminNavItem = { href: "/kargo", label: "Kargo", icon: Truck, exact: false, menuGroup: "Günlük iş" };
const FATURALAR: AdminNavItem = { href: "/faturalar", label: "Faturalar", icon: FileText, exact: false, menuGroup: "Kayıtlar" };
const REKLAM: AdminNavItem = { href: "/reklam", label: "Reklam", icon: Megaphone, exact: false, menuGroup: "Satış" };
const VITRIN: AdminNavItem = { href: "/vitrin", label: "Vitrin", icon: Images, exact: false, menuGroup: "Satış" };
const MAGAZA_AYARLARI: AdminNavItem = { href: "/magaza-ayarlari", label: "Mağaza ayarları", icon: Store, exact: false, menuGroup: "Ayarlar" };

/** Desktop sidebar order (unchanged from before the phone shell existed). */
export const navItems: readonly AdminNavItem[] = [
  PANEL,
  TAKVIM,
  ANIMSATICILAR,
  MUSTERILER,
  SIPARISLER,
  TEKRARLANANLAR,
  URUNLER,
  HARITA,
  ROTA,
  KARGO,
  FATURALAR,
  REKLAM,
  VITRIN,
  MAGAZA_AYARLARI,
];

export const FINANS_HREF = "/finans";
export const FINANS_ICON = PiggyBank;

export const financeSubItems = [
  { href: "/finans", label: "Finans Özeti" },
  { href: "/finans/pazar-satislari", label: "Pazar Satışları" },
  { href: "/finans/giderler", label: "Giderler" },
  { href: "/finans/rutin-giderler", label: "Rutin Giderler" },
  { href: "/finans/urun-cetelesi", label: "Ürün Çetelesi" },
] as const;

export function isNavItemActive(
  pathname: string,
  item: Pick<AdminNavItem, "href" | "exact">,
): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The four destinations pinned to the phone tab bar — the daily loop: what is
 * waiting, the orders, today's drive, who it is for. Everything else lives one
 * tap away under "Menü".
 */
export const tabBarItems: readonly AdminNavItem[] = [
  PANEL,
  SIPARISLER,
  ROTA,
  MUSTERILER,
];

/** Phone menu, derived from `navItems` so it always lists every page. */
export const menuGroups: readonly { readonly title: string; readonly items: readonly AdminNavItem[] }[] =
  MENU_GROUP_TITLES.map((title) => ({
    title,
    items: navItems.filter((item) => item.menuGroup === title),
  }));

export const settingsItems: readonly AdminNavItem[] = navItems.filter(
  (item) => item.menuGroup === "Ayarlar",
);

/** The drive screen is a focused, full-height mode with its own bottom action
 *  bar ("Atla / Teslim Edildi"); the tab bar stays out of its way. */
export function hidesTabBar(pathname: string): boolean {
  return pathname === "/routes/drive" || pathname.startsWith("/routes/drive/");
}
