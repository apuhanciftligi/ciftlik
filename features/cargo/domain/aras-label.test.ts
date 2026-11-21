import { describe, expect, it } from "vitest";

import { composeArasLabels } from "@/features/cargo/domain/aras-label";

describe("composeArasLabels", () => {
  it("makes one label per parcel, each with that parcel's barcode, dated in Istanbul time", () => {
    // 21:30 UTC on 26 Oct is already 27 Oct in Istanbul (UTC+3).
    expect(
      composeArasLabels({
        integrationCode: "26081800477",
        pieceCount: 2,
        firstName: "Ayşe",
        lastName: "  Yılmaz ",
        printedAt: new Date("2026-10-26T21:30:00Z"),
      }),
    ).toEqual([
      {
        date: "27.10.2026",
        sender: "Apuhan Çiftliği",
        receiver: "Ayşe Yılmaz",
        integrationCode: "26081800477",
        barcode: "2608180047701",
        piece: "Koli 1/2",
      },
      {
        date: "27.10.2026",
        sender: "Apuhan Çiftliği",
        receiver: "Ayşe Yılmaz",
        integrationCode: "26081800477",
        barcode: "2608180047702",
        piece: "Koli 2/2",
      },
    ]);
  });

  it("shows a dash when no name is on file", () => {
    expect(
      composeArasLabels({
        integrationCode: "1234",
        pieceCount: 1,
        firstName: null,
        lastName: " ",
        printedAt: new Date("2026-10-26T09:00:00Z"),
      })[0]?.receiver,
    ).toBe("—");
  });
});
