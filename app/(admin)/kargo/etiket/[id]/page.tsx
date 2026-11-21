/**
 * Aras Kargo parcel labels for one order (one per parcel), ready to print. On
 * screen they sit in the admin shell with a print button; when printed, only
 * the 100×100 mm labels go to paper, one per page (see ArasLabelPrint).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { getArasLabels } from "@/features/cargo/application/aras";
import { ArasLabelPrint } from "@/features/cargo/ui/aras-label-print";
import { ArasLabelSheet } from "@/features/cargo/ui/aras-label-sheet";
import { PrintLabelButton } from "@/features/cargo/ui/print-label-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function ArasLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.string().uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const result = await getArasLabels(parsed.data);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Aras Etiketi</h2>
          <p className="text-sm text-muted-foreground">
            {result.ok && result.value.length > 1
              ? `${result.value.length} koli: her koliye kendi etiketini yapıştırın. Şubede her barkod okutulur.`
              : "Paketin üzerine yapıştırın. Şubede barkod okutulur."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/kargo" className={cn(buttonVariants({ variant: "ghost" }))}>
            Kargo&apos;ya dön
          </Link>
          {result.ok ? <PrintLabelButton /> : null}
        </div>
      </div>

      {result.ok ? (
        <>
          <div className="flex flex-wrap gap-4">
            {result.value.map((label) => (
              <ArasLabelSheet key={label.barcode} label={label} />
            ))}
          </div>
          <ArasLabelPrint>
            {result.value.map((label) => (
              <ArasLabelSheet key={label.barcode} label={label} />
            ))}
          </ArasLabelPrint>
        </>
      ) : (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
          {result.error.message}
        </div>
      )}
    </div>
  );
}
