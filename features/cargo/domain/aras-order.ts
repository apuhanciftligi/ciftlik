/**
 * Aras Kargo "SetOrder" payload, built from what we already store on a cargo
 * order. Pure: no XML, no HTTP (that's infrastructure/aras-client.ts).
 *
 * Our Aras account is "Parça Bazlı" (piece-based): at the branch, staff scan
 * each parcel's own barcode, and Aras only recognises a barcode that was sent
 * beforehand as a PieceDetail.BarcodeNumber. So every parcel gets one
 * PieceDetail, and the label prints that barcode (see aras-label.ts). Sending
 * only the integration code (our first version) passed Aras's test, but live
 * branches could not match the scanned label to anything.
 *
 * Weights are a placeholder of 1: the branch weighs and measures each parcel
 * at drop-off and charges by what it measures.
 *
 * Field limits are Aras's (SetOrder doc §4.1). Text that only describes the
 * address is truncated to fit; anything Aras requires and we don't have
 * (phone, il, ilçe, address) is a validation error the admin can fix.
 */
import { ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

export interface ArasOrder {
  /** Our order reference at Aras; staff type or scan it at the branch. */
  readonly integrationCode: string;
  /** Required by Aras (max 16). Same value as the integration code. */
  readonly tradingWaybillNumber: string;
  readonly receiverName: string;
  readonly receiverAddress: string;
  /** 10 digits, no leading 0 or +90 (e.g. "5321234567"). */
  readonly receiverPhone: string;
  readonly cityName: string;
  readonly townName: string;
  readonly quarterName: string | null;
  /** One per parcel, in order; never empty. */
  readonly pieces: readonly ArasPiece[];
}

export interface ArasPiece {
  /** Printed as the parcel label's barcode; scanned at the branch. */
  readonly barcodeNumber: string;
  /** "Koli 1/2" — shown to branch staff. */
  readonly description: string;
}

/** Parcels per order we accept (the DB check allows the same range). */
export const ARAS_MAX_PIECES = 20;

export interface ArasOrderSource {
  readonly orderNumber: string;
  readonly firstName: unknown;
  readonly lastName: unknown;
  /** E.164 as stored (`+90…`), or null. */
  readonly phone: unknown;
  /** `orders.delivery_address_snapshot` (raw jsonb). */
  readonly snapshot: unknown;
  /** How many parcels go to the branch (1–ARAS_MAX_PIECES). */
  readonly pieceCount: number;
}

const LIMITS = {
  name: 100,
  address: 250,
  city: 32,
  town: 32,
  quarter: 64,
  waybill: 16,
} as const;

/**
 * The integration code for an order: the digits of its order number
 * ("260818-K-00477" → "26081800477"). Digits only so staff can type it on a
 * branch terminal; unique because order_number's sequence part is unique.
 */
export function arasIntegrationCode(orderNumber: string): string | null {
  const digits = orderNumber.replace(/\D/g, "");
  return /^[0-9]{2,16}$/.test(digits) ? digits : null;
}

/**
 * Barcode of parcel `piece` (1-based) of an order: the integration code plus a
 * two-digit parcel number ("26081800477" → "2608180047701", "…02"). Digits
 * only, unique per parcel because the integration code is unique per order,
 * and derivable again when the label is reprinted.
 */
export function arasPieceBarcode(integrationCode: string, piece: number): string {
  return `${integrationCode}${String(piece).padStart(2, "0")}`;
}

export function isValidArasPieceCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= ARAS_MAX_PIECES;
}

/** The parcels of an order sent as `count` pieces. */
export function arasPieces(integrationCode: string, count: number): ArasPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    barcodeNumber: arasPieceBarcode(integrationCode, i + 1),
    description: `Koli ${i + 1}/${count}`,
  }));
}

/** Aras's public tracking page for one of our shipments. */
export function arasTrackingUrl(accountId: string, integrationCode: string): string {
  return (
    "https://kargotakip.araskargo.com.tr/mainpage.aspx" +
    `?accountid=${encodeURIComponent(accountId)}&alici_kod=${encodeURIComponent(integrationCode)}`
  );
}

/** "+905321234567" → "5321234567"; anything else → null. */
export function arasPhone(e164: unknown): string | null {
  if (typeof e164 !== "string") return null;
  const match = /^\+90([1-9][0-9]{9})$/.exec(e164.trim());
  return match?.[1] ?? null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function fit(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max).trim();
}

export function buildArasOrder(source: ArasOrderSource): Result<ArasOrder, ValidationError> {
  const snap =
    typeof source.snapshot === "object" && source.snapshot !== null
      ? (source.snapshot as Record<string, unknown>)
      : {};

  const integrationCode = arasIntegrationCode(source.orderNumber);
  const name = [text(source.firstName), text(source.lastName)].filter(Boolean).join(" ");
  const phone = arasPhone(source.phone);
  const city = text(snap.city);
  const town = text(snap.district);
  const quarter = text(snap.neighborhood);
  const composed = [
    quarter,
    text(snap.street),
    text(snap.building_no) && `No: ${text(snap.building_no)}`,
    text(snap.apartment_no) && `Daire: ${text(snap.apartment_no)}`,
  ]
    .filter(Boolean)
    .join(" ");
  const address = text(snap.raw_text) || composed || text(snap.description);

  const missing: string[] = [];
  if (!integrationCode) missing.push("sipariş numarası");
  if (!name) missing.push("alıcı adı");
  if (!phone) missing.push("telefon");
  if (!city) missing.push("il");
  if (!town) missing.push("ilçe");
  if (!address) missing.push("adres");
  if (!isValidArasPieceCount(source.pieceCount)) {
    return err(
      new ValidationError({
        message: `Koli sayısı 1 ile ${ARAS_MAX_PIECES} arasında olmalı.`,
        details: { pieceCount: source.pieceCount },
      }),
    );
  }
  if (!integrationCode || missing.length > 0) {
    return err(
      new ValidationError({
        message: `Aras'a gönderilemedi, eksik bilgi: ${missing.join(", ")}.`,
        details: { missing },
      }),
    );
  }

  return ok({
    integrationCode,
    tradingWaybillNumber: fit(integrationCode, LIMITS.waybill),
    receiverName: fit(name, LIMITS.name),
    receiverAddress: fit(address, LIMITS.address),
    receiverPhone: phone as string,
    cityName: fit(city, LIMITS.city),
    townName: fit(town, LIMITS.town),
    quarterName: quarter ? fit(quarter, LIMITS.quarter) : null,
    pieces: arasPieces(integrationCode, source.pieceCount),
  });
}

export type ArasCancelOutcome =
  /** Aras deleted the record (or says it was never there). */
  | "cancelled"
  /** The branch already accepted the parcel; the shipment can't be undone here. */
  | "already_accepted"
  | "failed";

/** CancelDispatch result codes (SetOrder doc §6.2). */
export function arasCancelOutcome(resultCode: string): ArasCancelOutcome {
  switch (resultCode.trim()) {
    case "0":
    case "1":
    case "-1": // "Kayıt bulunamadı" — nothing left at Aras to cancel.
      return "cancelled";
    case "999":
      return "already_accepted";
    default:
      return "failed";
  }
}
