import { describe, expect, it } from "vitest";

import {
  arasCancelOutcome,
  arasIntegrationCode,
  arasPhone,
  arasPieceBarcode,
  arasTrackingUrl,
  buildArasOrder,
} from "@/features/cargo/domain/aras-order";

const snapshot = {
  raw_text: "Kızılay Mah. Atatürk Cad. No: 12 Daire: 3, Çankaya / Ankara",
  city: "Ankara",
  district: "Çankaya",
  neighborhood: "Kızılay",
  street: "Atatürk Cad.",
  building_no: "12",
  apartment_no: "3",
};

describe("arasIntegrationCode", () => {
  it("keeps only the digits of the order number", () => {
    expect(arasIntegrationCode("260818-K-00477")).toBe("26081800477");
    expect(arasIntegrationCode("ORD-2026-00475")).toBe("202600475");
  });

  it("rejects numbers without enough digits", () => {
    expect(arasIntegrationCode("K-1")).toBeNull();
    expect(arasIntegrationCode("")).toBeNull();
  });
});

describe("arasPhone", () => {
  it("turns E.164 into Aras's 10-digit form", () => {
    expect(arasPhone("+905321234567")).toBe("5321234567");
  });

  it("rejects anything that is not a Turkish E.164 number", () => {
    expect(arasPhone("05321234567")).toBeNull();
    expect(arasPhone(null)).toBeNull();
    expect(arasPhone("+4915112345678")).toBeNull();
  });
});

describe("arasTrackingUrl", () => {
  it("builds the tracking page link from our account id and code", () => {
    expect(arasTrackingUrl("ABC123", "26081800477")).toBe(
      "https://kargotakip.araskargo.com.tr/mainpage.aspx?accountid=ABC123&alici_kod=26081800477",
    );
  });
});

describe("buildArasOrder", () => {
  it("maps a complete cargo order", () => {
    const result = buildArasOrder({
      orderNumber: "260818-K-00477",
      firstName: "Ayşe",
      lastName: " Yılmaz ",
      phone: "+905321234567",
      snapshot,
      pieceCount: 2,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        integrationCode: "26081800477",
        tradingWaybillNumber: "26081800477",
        receiverName: "Ayşe Yılmaz",
        receiverAddress: snapshot.raw_text,
        receiverPhone: "5321234567",
        cityName: "Ankara",
        townName: "Çankaya",
        quarterName: "Kızılay",
        pieces: [
          { barcodeNumber: "2608180047701", description: "Koli 1/2" },
          { barcodeNumber: "2608180047702", description: "Koli 2/2" },
        ],
      },
    });
  });

  it("rejects a parcel count outside 1–20", () => {
    for (const pieceCount of [0, 21, 1.5]) {
      const result = buildArasOrder({
        orderNumber: "260818-K-00477",
        firstName: "Ayşe",
        lastName: "Yılmaz",
        phone: "+905321234567",
        snapshot,
        pieceCount,
      });
      expect(result.ok).toBe(false);
    }
  });

  it("composes the address from its parts when raw_text is empty", () => {
    const result = buildArasOrder({
      orderNumber: "260818-K-00477",
      firstName: "Ayşe",
      lastName: "Yılmaz",
      phone: "+905321234567",
      snapshot: { ...snapshot, raw_text: "" },
      pieceCount: 1,
    });
    expect(result.ok && result.value.receiverAddress).toBe(
      "Kızılay Atatürk Cad. No: 12 Daire: 3",
    );
  });

  it("truncates long text to Aras's limits", () => {
    const result = buildArasOrder({
      orderNumber: "260818-K-00477",
      firstName: "A".repeat(80),
      lastName: "B".repeat(80),
      phone: "+905321234567",
      snapshot: { ...snapshot, raw_text: "x".repeat(400), district: "Ç".repeat(40) },
      pieceCount: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.receiverName).toHaveLength(100);
    expect(result.value.receiverAddress).toHaveLength(250);
    expect(result.value.townName).toHaveLength(32);
  });

  it("lists every missing required field in one message", () => {
    const result = buildArasOrder({
      orderNumber: "260818-K-00477",
      firstName: "Ayşe",
      lastName: "Yılmaz",
      phone: null,
      snapshot: { raw_text: "Bir yer" },
      pieceCount: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toBe("Aras'a gönderilemedi, eksik bilgi: telefon, il, ilçe.");
  });
});

describe("arasPieceBarcode", () => {
  it("appends a two-digit parcel number to the integration code", () => {
    expect(arasPieceBarcode("26081800477", 1)).toBe("2608180047701");
    expect(arasPieceBarcode("26081800477", 12)).toBe("2608180047712");
  });
});

describe("arasCancelOutcome", () => {
  it("reads Aras's CancelDispatch result codes", () => {
    expect(arasCancelOutcome("0")).toBe("cancelled");
    expect(arasCancelOutcome("1")).toBe("cancelled");
    expect(arasCancelOutcome("-1")).toBe("cancelled");
    expect(arasCancelOutcome("999")).toBe("already_accepted");
    expect(arasCancelOutcome("936")).toBe("failed");
  });
});
