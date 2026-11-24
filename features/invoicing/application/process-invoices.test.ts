import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExternalApiError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

import type { InvoiceOrder } from "@/features/invoicing/domain/order-invoice";
import type { InvoiceRow } from "@/features/invoicing/infrastructure/invoice.repository";

vi.mock("next/server", () => ({ after: vi.fn() }));
const mockEnv = vi.hoisted((): Record<string, string | undefined> => ({
  QNB_EARSIV_USERNAME: "u",
  QNB_EARSIV_PASSWORD: "p",
  QNB_VKN: "0106106900",
  QNB_ERP_CODE: "QES00001",
  QNB_TEST_MODE: "1",
  LOG_LEVEL: "silent",
}));
vi.mock("@/shared/env", () => ({ env: mockEnv }));
const repo = vi.hoisted(() => ({
  claimDueInvoices: vi.fn(),
  loadInvoiceOrder: vi.fn(),
  markInvoiceIssued: vi.fn(),
  markInvoiceFailed: vi.fn(),
  markInvoiceCancelled: vi.fn(),
}));
vi.mock("@/features/invoicing/infrastructure/invoice.repository", () => repo);
const qnb = vi.hoisted(() => ({
  createEarsivInvoice: vi.fn(),
  findEarsivInvoice: vi.fn(),
  cancelEarsivInvoice: vi.fn(),
}));
vi.mock("@/features/invoicing/infrastructure/qnb-client", () => qnb);

const { cancelIssuedInvoice, processDueInvoices } = await import("@/features/invoicing/application/process-invoices");

const row = (attempts: number): InvoiceRow => ({
  id: "6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b",
  order_id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  status: "processing",
  channel: null,
  invoice_number: null,
  view_url: null,
  attempts,
  last_error: null,
  issued_at: null,
  cancelled_at: null,
  created_at: "2026-11-20T10:00:00Z",
});

const order: InvoiceOrder = {
  orderNumber: "APH-1",
  status: "confirmed",
  paymentStatus: "paid",
  paidViaPaytr: true,
  paidAt: new Date(),
  totalMinor: 13000,
  deliveryFeeMinor: 0,
  fulfillmentChannel: "shipping",
  customer: { firstName: "Ayşe", lastName: "Yılmaz", email: null },
  address: { street: "Cumhuriyet Cad.", district: "Battalgazi", city: "Malatya", postalCode: null },
  items: [{ name: "Yumurta", unit: "package", quantity: 1, lineTotalMinor: 13000, vatRate: 1 }],
};
const issued = {
  invoiceNumber: "QSB2026000000001",
  uuid: row(1).id,
  viewUrl: "https://earsivtest.qnbesolutions.com.tr/x",
  cancelledAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.loadInvoiceOrder.mockResolvedValue(ok(order));
  repo.markInvoiceIssued.mockResolvedValue(ok(undefined));
  repo.markInvoiceFailed.mockResolvedValue(ok(undefined));
});

describe("processDueInvoices", () => {
  it("uses the live endpoints when test mode is off", async () => {
    const saved = mockEnv.QNB_TEST_MODE;
    mockEnv.QNB_TEST_MODE = "0";
    try {
      repo.claimDueInvoices.mockResolvedValue(ok([row(1)]));
      qnb.createEarsivInvoice.mockResolvedValue(ok(issued));
      await processDueInvoices();
      expect(qnb.createEarsivInvoice.mock.calls[0]?.[0]).toMatchObject({ erpCode: "QES00001", testMode: false });
    } finally {
      mockEnv.QNB_TEST_MODE = saved;
    }
  });

  it("stays off until the e-Arşiv user and the ERP code are set", async () => {
    for (const key of ["QNB_EARSIV_USERNAME", "QNB_ERP_CODE"]) {
      const saved = mockEnv[key];
      mockEnv[key] = undefined;
      try {
        expect(await processDueInvoices()).toBeNull();
        expect(repo.claimDueInvoices).not.toHaveBeenCalled();
      } finally {
        mockEnv[key] = saved;
      }
    }
  });

  it("issues an e-Arşiv invoice and records its number", async () => {
    repo.claimDueInvoices.mockResolvedValue(ok([row(1)]));
    qnb.createEarsivInvoice.mockResolvedValue(ok(issued));
    expect(await processDueInvoices()).toEqual({ processed: 1, issued: 1 });
    expect(qnb.createEarsivInvoice.mock.calls[0]?.[1]).toMatchObject({ uuid: row(1).id });
    expect(repo.markInvoiceIssued).toHaveBeenCalledWith(row(1).id, expect.objectContaining({
      channel: "earsiv",
      invoiceNumber: issued.invoiceNumber,
    }));
  });

  it("schedules a retry when QNB fails", async () => {
    repo.claimDueInvoices.mockResolvedValue(ok([row(1)]));
    qnb.createEarsivInvoice.mockResolvedValue(err(new ExternalApiError({ message: "QNB'ye bağlanılamadı." })));
    await processDueInvoices();
    const [, reason, nextAt] = repo.markInvoiceFailed.mock.calls[0] ?? [];
    expect(reason).toBe("QNB'ye bağlanılamadı.");
    expect(nextAt).toBeInstanceOf(Date);
  });

  it("recovers an invoice QNB created on an earlier, timed-out try", async () => {
    repo.claimDueInvoices.mockResolvedValue(ok([row(2)]));
    qnb.createEarsivInvoice.mockResolvedValue(err(new ExternalApiError({ message: "islemId kullanılmış" })));
    qnb.findEarsivInvoice.mockResolvedValue(ok(issued));
    expect(await processDueInvoices()).toEqual({ processed: 1, issued: 1 });
    expect(repo.markInvoiceFailed).not.toHaveBeenCalled();
  });

  it("parks bad order data for a human without calling QNB", async () => {
    repo.claimDueInvoices.mockResolvedValue(ok([row(1)]));
    repo.loadInvoiceOrder.mockResolvedValue(ok({ ...order, customer: { ...order.customer, lastName: "" } }));
    await processDueInvoices();
    expect(qnb.createEarsivInvoice).not.toHaveBeenCalled();
    expect(repo.markInvoiceFailed).toHaveBeenCalledWith(row(1).id, "Müşterinin soyadı en az 2 harf olmalı.", null);
  });

  it("gives up after the last attempt", async () => {
    repo.claimDueInvoices.mockResolvedValue(ok([row(6)]));
    qnb.createEarsivInvoice.mockResolvedValue(err(new ExternalApiError({ message: "hata" })));
    qnb.findEarsivInvoice.mockResolvedValue(err(new ExternalApiError({ message: "yok" })));
    await processDueInvoices();
    expect(repo.markInvoiceFailed).toHaveBeenCalledWith(row(6).id, "hata", null);
  });
});

describe("cancelIssuedInvoice", () => {
  const issuedRow: InvoiceRow = { ...row(1), status: "issued", channel: "earsiv", invoice_number: issued.invoiceNumber };

  beforeEach(() => repo.markInvoiceCancelled.mockResolvedValue(ok(true)));

  it("cancels at QNB, then marks the row", async () => {
    qnb.cancelEarsivInvoice.mockResolvedValue(ok(undefined));
    expect((await cancelIssuedInvoice(issuedRow)).ok).toBe(true);
    expect(qnb.cancelEarsivInvoice.mock.calls[0]?.[1]).toBe(issuedRow.id);
    expect(repo.markInvoiceCancelled).toHaveBeenCalledWith(issuedRow.id, expect.any(Date));
  });

  it("refuses anything but an issued e-Arşiv invoice, without calling QNB", async () => {
    for (const patch of [{ status: "failed" as const }, { status: "cancelled" as const }, { channel: "efatura" as const }]) {
      expect((await cancelIssuedInvoice({ ...issuedRow, ...patch })).ok).toBe(false);
    }
    expect(qnb.cancelEarsivInvoice).not.toHaveBeenCalled();
  });

  it("marks the row when QNB had already cancelled it", async () => {
    qnb.cancelEarsivInvoice.mockResolvedValue(err(new ExternalApiError({ message: "zaten iptal" })));
    qnb.findEarsivInvoice.mockResolvedValue(ok({ ...issued, cancelledAt: "2026-11-24 10:00:00" }));
    expect((await cancelIssuedInvoice(issuedRow)).ok).toBe(true);
    expect(repo.markInvoiceCancelled).toHaveBeenCalled();
  });

  it("keeps the row issued when QNB refuses and the invoice is not cancelled", async () => {
    qnb.cancelEarsivInvoice.mockResolvedValue(err(new ExternalApiError({ message: "QNB e-Arşiv reddetti (AE1): x" })));
    qnb.findEarsivInvoice.mockResolvedValue(ok(issued));
    const res = await cancelIssuedInvoice(issuedRow);
    expect(res.ok ? null : res.error.message).toBe("QNB e-Arşiv reddetti (AE1): x");
    expect(repo.markInvoiceCancelled).not.toHaveBeenCalled();
  });
});
