/**
 * The "dummy" labels stuck on the parcels we hand to Aras Kargo (SetOrder doc
 * Şekil 1), one per parcel. Our account is "Parça Bazlı", so at the branch
 * staff scan each label's barcode, which is that parcel's
 * PieceDetail.BarcodeNumber (see aras-order.ts); Aras then prints its own
 * final barcode for the parcel. Aras asked that the template's bottom
 * "Sipariş Bazlı" note be left off, so there is no such line here.
 */
import { arasPieces } from "@/features/cargo/domain/aras-order";
import { toIstanbulDateString } from "@/shared/utils/date";

/** Who the parcel is from, as printed on the label. */
export const ARAS_LABEL_SENDER = "Apuhan Çiftliği";

export interface ArasLabel {
  /** dd.MM.yyyy in Europe/Istanbul. */
  readonly date: string;
  readonly sender: string;
  readonly receiver: string;
  readonly integrationCode: string;
  /** The parcel's barcode, as sent to Aras. */
  readonly barcode: string;
  /** "Koli 1/2". */
  readonly piece: string;
}

/** One label per parcel the order was sent to Aras with. */
export function composeArasLabels(input: {
  integrationCode: string;
  pieceCount: number;
  firstName: unknown;
  lastName: unknown;
  printedAt: Date;
}): ArasLabel[] {
  const part = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const receiver = [part(input.firstName), part(input.lastName)].filter(Boolean).join(" ") || "—";
  const [y, m, d] = toIstanbulDateString(input.printedAt).split("-");

  return arasPieces(input.integrationCode, input.pieceCount).map((piece) => ({
    date: `${d}.${m}.${y}`,
    sender: ARAS_LABEL_SENDER,
    receiver,
    integrationCode: input.integrationCode,
    barcode: piece.barcodeNumber,
    piece: piece.description,
  }));
}
