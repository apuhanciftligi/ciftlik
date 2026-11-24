/**
 * Faturalar — the QNB invoice queue and record. Orders paid through PayTR land
 * here automatically once fully paid; issued ones link to the invoice, failed
 * ones show why and can be retried. Two tabs: live invoices and cancelled
 * ones (?sekme=iptal). Each card shows the order behind the invoice.
 * Paginated (25 per page).
 */
import Link from "next/link";

import { cn } from "@/lib/utils";

import { listInvoicesAction } from "@/features/invoicing/application/invoice-admin";
import { InvoiceTable } from "@/features/invoicing/ui/invoice-table";

export default async function FaturalarPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sekme?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const tab = params.sekme === "iptal" ? "cancelled" : "active";
  const result = await listInvoicesAction(tab, page - 1);

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Faturalar yüklenemedi: {result.error.message}
      </div>
    );
  }

  const { rows, total, counts, pageSize } = result.value;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const tabQuery = tab === "cancelled" ? "sekme=iptal&" : "";
  const tabs = [
    { key: "active", href: "/faturalar", label: "Faturalar", count: counts.active },
    { key: "cancelled", href: "/faturalar?sekme=iptal", label: "İptal edilenler", count: counts.cancelled },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Faturalar</h1>
        <p className="text-sm text-muted-foreground">
          Ödemesi PayTR ile online gelen siparişlerin e-Arşiv faturaları QNB üzerinden otomatik kesilir. Havale, elden ödeme ve panelden “ödendi” işaretlenen siparişlerin faturası elle kesilir. Sipariş iptal edilince faturası da otomatik iptal edilir. İade veya fazladan siparişte kesilmiş faturayı “İptal et” ile de iptal edebilirsiniz.
        </p>
      </div>
      <nav className="flex gap-1 border-b" aria-label="Fatura sekmeleri">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              t.key === tab
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label} <span className="text-muted-foreground">({t.count})</span>
          </Link>
        ))}
      </nav>
      <InvoiceTable rows={rows} tab={tab} />
      {pageCount > 1 ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Sayfalar">
          {page > 1 ? <Link href={`/faturalar?${tabQuery}page=${page - 1}`} className="hover:underline">← Önceki</Link> : <span />}
          <span className="text-muted-foreground">{page} / {pageCount}</span>
          {page < pageCount ? <Link href={`/faturalar?${tabQuery}page=${page + 1}`} className="hover:underline">Sonraki →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
