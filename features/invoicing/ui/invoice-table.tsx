"use client";

/**
 * Admin invoice list: one row per queued/issued invoice, newest first. Issued
 * rows link to QNB's viewer and can be cancelled (refund, duplicate order);
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

import { cancelInvoiceAction, retryInvoiceAction } from "@/features/invoicing/application/invoice-admin";
import type { InvoiceListRow } from "@/features/invoicing/application/invoice-types";

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

const CANCEL_REASONS = [
  { value: "refund", label: "İade" },
  { value: "duplicate", label: "Fazladan / mükerrer sipariş" },
  { value: "other", label: "Başka bir sebep" },
] as const;
type CancelReason = (typeof CANCEL_REASONS)[number]["value"];

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
            <strong className="text-foreground">{row.invoice_number}</strong> ({row.order_number}) QNB&apos;de
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

export function InvoiceTable({ rows }: { rows: readonly InvoiceListRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border px-4 py-6 text-sm text-muted-foreground">
        Henüz fatura yok. Ödemesi PayTR ile gelen siparişler burada görünür. Diğer siparişlerin faturası elle kesilir.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/orders/${row.order_id}`} className="font-medium hover:underline">
                {row.order_number}
              </Link>
              <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
              {row.invoice_number ? (
                <span className="font-mono text-xs text-muted-foreground">{row.invoice_number}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {row.issued_at ? `Kesildi: ${formatDateTime(row.issued_at)}` : `Sıraya girdi: ${formatDateTime(row.created_at)}`}
              {row.cancelled_at ? ` · İptal edildi: ${formatDateTime(row.cancelled_at)}` : ""}
              {row.attempts > 0 && row.status !== "issued" ? ` · ${row.attempts}. deneme` : ""}
            </p>
            {row.last_error && row.status !== "issued" ? (
              <p className="break-words text-xs text-destructive">{row.last_error}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            {row.view_url ? (
              <Button size="sm" variant="secondary" className="gap-1.5" render={<a href={row.view_url} target="_blank" rel="noreferrer" />}>
                <ExternalLink className="h-3.5 w-3.5" />
                Faturayı gör
              </Button>
            ) : null}
            {row.status === "failed" || row.status === "needs_attention" ? <RetryButton id={row.id} /> : null}
            {row.status === "issued" && row.channel === "earsiv" ? <CancelButton row={row} /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
