-- fatura_sadece_paytr
--
-- Owner kararı 2026-11-23: otomatik fatura ŞİMDİLİK yalnızca ödemesi
-- PayTR üzerinden online gelmiş siparişlere kesilir. Siparişin kargo, rota
-- ya da düzenli sipariş olması fark etmez. Ölçüt tek: siparişin ödeme
-- kayıtlarında PayTR'ın yazdığı bir satır var (order_payments.provider =
-- 'paytr'). Havale, elden ödeme ve admin panelinden elle "ödendi"
-- işaretlenen siparişler otomatik faturalanmaz; onların faturası elle
-- kesilir.
--
-- 1. enqueue_invoice_on_paid() aynı imzayla bu koşulla yeniden yazılır.
-- 2. Kuyrukta bekleyen ama ödemesi PayTR'dan gelmemiş siparişlere ait
--    satırlar silinir. Fatura kesimi hâlâ kapalı (QNB ayarları girilmedi),
--    yani bu satırların hiçbiri QNB'ye gitmedi ve hiçbiri fatura değil.
--    Silinen sadece kuyruk satırıdır; siparişin kendisine, ödemesine,
--    tutarına dokunulmaz. Fatura numarası almış ya da QNB'ye gitmiş
--    satırlara (invoice_number / qnb_document_oid dolu) ve 'processing' /
--    'issued' / 'cancelled' satırlara dokunulmaz.
--
-- Geriye dönük uyumlu: fonksiyon imzası ve tablo yapısı değişmez.

create or replace function enqueue_invoice_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'paid'
     and old.payment_status is distinct from 'paid'
     and new.total_minor > 0
     and new.status <> 'cancelled'
     -- The PayTR ledger row is written in the same transaction, before the
     -- recompute that fires this trigger, so it is visible here.
     and exists (
       select 1 from order_payments p
       where p.order_id = new.id and p.provider = 'paytr'
     ) then
    insert into invoices (order_id) values (new.id)
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

delete from public.invoices i
where i.status in ('pending', 'failed', 'needs_attention')
  and i.invoice_number is null
  and i.qnb_document_oid is null
  and not exists (
    select 1 from public.order_payments p
    where p.order_id = i.order_id and p.provider = 'paytr'
  );
