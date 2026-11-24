-- fatura_iptal_sebebi
--
-- /faturalar sayfası iptal edilen faturaları ayrı bir sekmede, iptal
-- sebebiyle birlikte gösteriyor (owner isteği 2026-11-24). Sebep şimdiye
-- kadar sadece audit kaydındaydı (elle iptal) ya da hiç yazılmıyordu
-- (sipariş iptaliyle otomatik iptal). Bundan sonra faturanın kendisinde
-- tutulur:
--   refund          İade (elle, "İptal et")
--   duplicate       Fazladan / mükerrer sipariş (elle)
--   other           Başka bir sebep (elle)
--   order_cancelled Sipariş iptal edildiği için otomatik
--
-- Geriye dönük uyumlu: yeni, boş (null) bir kolon ve aynı imzayla yeniden
-- yazılan trigger fonksiyonu. Eski kod kolonu görmez; eski satırlarda sebep
-- aşağıda mevcut kayıtlardan doldurulur, bulunamazsa boş kalır.

alter table public.invoices
  add column cancel_reason text
    check (cancel_reason in ('refund', 'duplicate', 'other', 'order_cancelled'));

comment on column public.invoices.cancel_reason is
  'İptal sebebi: refund | duplicate | other (elle) ya da order_cancelled (sipariş iptaliyle otomatik).';

-- "İptal edilenler" sekmesi: yeni → eski, sayfalı. Partial: sadece iptal
-- satırları, sekmenin sayısı da bu index'ten sayılır.
create index invoices_cancelled_created_at_idx on public.invoices (created_at desc)
  where status = 'cancelled';

-- Same as in siparis_iptalinde_fatura_iptal, plus the reason on the row it
-- closes directly. Rows it flags get their reason when the app cancels them.
create or replace function request_invoice_cancel_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Never sent to QNB: nothing exists there, close the row here.
  update invoices
  set status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = 'order_cancelled',
      updated_at = now()
  where order_id = new.id
    and status = 'pending'
    and attempts = 0;

  -- Issued, or being issued right now: ask the app to cancel it at QNB.
  update invoices
  set cancel_requested_at = now(),
      next_attempt_at = now(),
      updated_at = now()
  where order_id = new.id
    and status in ('issued', 'processing')
    and cancel_requested_at is null;

  return new;
end;
$$;

-- Backfill: rows cancelled because their order was cancelled.
update public.invoices
set cancel_reason = 'order_cancelled'
where status = 'cancelled'
  and cancel_reason is null
  and cancel_requested_at is not null;

-- Backfill: hand cancellations, from their audit entry (latest wins).
update public.invoices i
set cancel_reason = a.reason
from (
  select distinct on (entity_id) entity_id, after ->> 'reason' as reason
  from public.audit_log
  where entity_type = 'invoice'
    and action = 'invoice.cancelled'
    and after ->> 'reason' in ('refund', 'duplicate', 'other')
  order by entity_id, created_at desc
) a
where i.id = a.entity_id
  and i.status = 'cancelled'
  and i.cancel_reason is null;
