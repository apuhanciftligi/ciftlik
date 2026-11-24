"use client";

/**
 * Admin invoice list: one row per queued/issued invoice, newest first. Issued
 * rows link to QNB's viewer and can be cancelled (refund, duplicate order);
 * an issued row whose order was cancelled shows that its automatic
 * cancellation is pending (and why, if QNB refused);
 * failed or parked rows show the reason and a "Tekrar dene" button that puts
 * them back in the queue.
 */
import { Ban, ExternalLink, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatDateTime } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

import { cancelInvoiceAction, retryInvoiceAction } from "@/features/invoicing/application/invoice-admin";
import { MANUAL_CANCEL_REASONS, type InvoiceCancelReason } from "@/features/invoicing/domain/invoice";
import type { InvoiceListRow, InvoiceListTab } from "@/features/invoicing/application/invoice-types";

const STATUS_LABEL: Record<InvoiceListRow["status"], string> = {
  pending: "Sırada",
  processing: "Gönderiliyor",
  issued: "Kesildi",
  failed: "Tekrar denenecek",
  needs_attention: "İlgilenilmeli",
  cancelled: "İptal",
};

const STATUS_VARIANT: Record<InvoiceListRow["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  processing: "secondary",
  issued: "default",
  failed: "outline",
  needs_attention: "destructive",
  cancelled: "outline",
};

function RetryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await retryInvoiceAction({ invoice_id: id });
          if (res.ok) toast.success("Fatura tekrar sıraya alındı.");
          else toast.error(res.error.message);
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
      Tekrar dene
    </Button>
  );
}

const CANCEL_REASON_LABEL: Record<InvoiceCancelReason, string> = {
  refund: "İade",
  duplicate: "Fazladan / mükerrer sipariş",
  other: "Başka bir sebep",
  order_cancelled: "Sipariş iptal edildiği için otomatik",
};
const CANCEL_REASONS = MANUAL_CANCEL_REASONS.map((value) => ({ value, label: CANCEL_REASON_LABEL[value] }));
type CancelReason = (typeof MANUAL_CANCEL_REASONS)[number];

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Bekliyor",
  confirmed: "Onaylandı",
  shipped: "Yolda",
  delivered: "Teslim edildi",
  cancelled: "İptal edildi",
};

const CHANNEL_LABEL = { earsiv: "e-Arşiv", efatura: "e-Fatura" } as const;

function CancelButton({ row }: { row: InvoiceListRow }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="gap-1.5"
        onClick={() => {
          setReason(null);
          setOpen(true);
        }}
      >
        <Ban className="h-3.5 w-3.5" />
        İptal et
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Fatura iptal edilsin mi?</DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{row.invoice_number}</strong> ({row.order.orderNumber}) QNB&apos;de
            iptal edilir ve GİB&apos;e iptal olarak bildirilir. Bu işlem geri alınamaz. Siparişe yeniden
            fatura gerekirse elle kesilir.
          </DialogDescription>
          <RadioGroup
            value={reason}
            onValueChange={(value) => setReason(value as CancelReason)}
            disabled={pending}
            className="grid gap-2"
          >
            {CANCEL_REASONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={option.value} />
                {option.label}
              </label>
            ))}
          </RadioGroup>
          {/* The safe answer comes first; the destructive one is spelled out. */}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-1.5"
              disabled={pending || reason === null}
              onClick={() =>
                start(async () => {
                  if (reason === null) return;
                  const res = await cancelInvoiceAction({ invoice_id: row.id, reason });
                  if (res.ok) {
                    toast.success(`${row.invoice_number ?? "Fatura"} iptal edildi.`);
                    setOpen(false);
                  } else {
                    toast.error(res.error.message);
                  }
                })
              }
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Evet, faturayı iptal et
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-x-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function quantity(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

function InvoiceCard({ row }: { row: InvoiceListRow }) {
  const { order } = row;
  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/orders/${row.order_id}`} className="font-medium hover:underline">
            {order.orderNumber}
          </Link>
          <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
          {row.status === "issued" && row.cancel_requested_at ? (
            <Badge variant="destructive">Sipariş iptal edildi · fatura iptali bekliyor</Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {row.view_url ? (
            <Button size="sm" variant="secondary" className="gap-1.5" render={<a href={row.view_url} target="_blank" rel="noreferrer" />}>
              <ExternalLink className="h-3.5 w-3.5" />
              Faturayı gör
            </Button>
          ) : null}
          {row.status === "failed" || row.status === "needs_attention" ? <RetryButton id={row.id} /> : null}
          {row.status === "issued" && row.channel === "earsiv" ? <CancelButton row={row} /> : null}
        </div>
      </div>

      <dl className="space-y-1.5">
        <Field label="Müşteri">
          {order.customerName}
          {order.customerEmail ? <span className="text-muted-foreground"> · {order.customerEmail}</span> : null}
        </Field>
        <Field label="Sipariş">
          {formatDateTime(order.orderedAt)} · {order.fulfillmentChannel === "shipping" ? "Kargo" : "Teslimat"} ·{" "}
          {ORDER_STATUS_LABEL[order.status] ?? order.status} · <strong>{formatTRY(order.totalMinor)}</strong>
        </Field>
        <Field label="Ürünler">
          <ul className="space-y-0.5">
            {order.items.map((item, i) => (
              <li key={i}>
                {quantity(item.quantity)} {item.unitLabel || "adet"} {item.name}
                {item.invoiceName ? <span className="text-muted-foreground"> (faturada: {item.invoiceName})</span> : null}
                <span className="text-muted-foreground"> · {item.lineTotalMinor > 0 ? formatTRY(item.lineTotalMinor) : "ücretsiz"}</span>
              </li>
            ))}
          </ul>
        </Field>
        <Field label="Ödeme">
          {order.paytrPaidAt ? `PayTR (kart) · ${formatDateTime(order.paytrPaidAt)}` : "PayTR ödemesi bulunamadı"}
        </Field>
        <Field label="Fatura">
          {row.invoice_number ? <span className="font-mono">{row.invoice_number}</span> : "Henüz kesilmedi"}
          {" · "}
          {row.channel ? CHANNEL_LABEL[row.channel] : "e-Arşiv"} · QNB üzerinden otomatik
          <br />
          <span className="text-muted-foreground">
            {row.issued_at ? `Kesildi: ${formatDateTime(row.issued_at)}` : `Sıraya girdi: ${formatDateTime(row.created_at)}`}
            {row.attempts > 0 && row.status !== "issued" && row.status !== "cancelled" ? ` · ${row.attempts}. deneme` : ""}
          </span>
        </Field>
        {row.status === "cancelled" ? (
          <Field label="İptal">
            {row.cancelled_at ? formatDateTime(row.cancelled_at) : "—"}
            {" · "}
            {row.cancel_reason ? CANCEL_REASON_LABEL[row.cancel_reason] : "Sebep kayıtlı değil"}
            {!row.invoice_number ? <span className="text-muted-foreground"> (QNB&apos;ye hiç gönderilmedi)</span> : null}
          </Field>
        ) : null}
      </dl>

      {row.last_error && (row.status !== "issued" || row.cancel_requested_at) && row.status !== "cancelled" ? (
        <p className="break-words text-xs text-destructive">{row.last_error}</p>
      ) : null}
    </li>
  );
}

export function InvoiceTable({ rows, tab }: { rows: readonly InvoiceListRow[]; tab: InvoiceListTab }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border px-4 py-6 text-sm text-muted-foreground">
        {tab === "cancelled"
          ? "İptal edilmiş fatura yok."
          : "Henüz fatura yok. Ödemesi PayTR ile gelen siparişler burada görünür. Diğer siparişlerin faturası elle kesilir."}
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((row) => (
        <InvoiceCard key={row.id} row={row} />
      ))}
    </ul>
  );
}
