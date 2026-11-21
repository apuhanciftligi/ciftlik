"use client";

/**
 * Sends a queued cargo order's recipient data and parcel count to Aras Kargo.
 * Our Aras account is piece-based: each parcel gets its own barcode, so the
 * count chosen here is how many labels "Etiket" prints. Once sent, the button
 * re-sends (e.g. after the address or the parcel count changed); Aras updates
 * the same record, and the labels must then be printed again.
 */
import { Loader2, RefreshCw, Send } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendOrderToArasAction } from "@/features/cargo/application/send-to-aras";
import { ARAS_MAX_PIECES } from "@/features/cargo/domain/aras-order";

export function SendToArasButton({
  orderId,
  alreadySent,
  pieceCount,
}: {
  orderId: string;
  alreadySent: boolean;
  /** Parcels the order was last sent with, if any. */
  pieceCount: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [pieces, setPieces] = useState(String(pieceCount ?? 1));
  const inputId = useId();

  const send = () => {
    startTransition(async () => {
      const result = await sendOrderToArasAction({ order_id: orderId, piece_count: pieces });
      if (result.status === "success") {
        toast.success(
          `Aras'a gönderildi (${pieces} koli). Aras kodu: ${result.integrationCode}. Etiketi yazdırın.`,
        );
      } else {
        toast.error(result.message);
      }
    });
  };

  const Icon = pending ? Loader2 : alreadySent ? RefreshCw : Send;

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={inputId} className="text-xs text-muted-foreground">
        Koli
      </label>
      <Input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={1}
        max={ARAS_MAX_PIECES}
        step={1}
        value={pieces}
        onChange={(e) => setPieces(e.target.value)}
        disabled={pending}
        className="h-8 w-14 px-2 text-sm"
      />
      <Button
        type="button"
        variant={alreadySent ? "ghost" : "outline"}
        size="sm"
        disabled={pending}
        onClick={send}
        className="gap-1.5"
        title={alreadySent ? "Bilgileri Aras'a tekrar gönder" : undefined}
      >
        <Icon className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        {alreadySent ? "Aras'a tekrar gönder" : "Aras'a Gönder"}
      </Button>
    </div>
  );
}
