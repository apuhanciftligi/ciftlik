-- siparis_iptalinde_fatura_iptal
--
-- Owner isteği 2026-11-24: sipariş iptal edilince faturası da otomatik
-- iptal olsun. Sipariş hangi yoldan iptal edilirse edilsin (panel, MCP,
-- başka bir RPC) yakalansın diye bu iş veritabanında, orders üzerindeki bir
-- trigger'la yapılır:
--
--   * Kuyrukta bekleyen ve HİÇ QNB'ye gönderilmemiş fatura satırı
--     (status 'pending', attempts = 0) doğrudan 'cancelled' olur. QNB'de
--     böyle bir fatura yok, iptal edilecek bir şey yok.
--   * Kesilmiş ('issued') ya da o an gönderilmekte olan ('processing')
--     satıra "iptal istendi" işareti (cancel_requested_at) konur. Uygulama
--     bu satırları claim_invoice_cancellations ile alır, QNB'de iptal eder
--     (faturaIptalEt) ve satırı 'cancelled' yapar. QNB'ye ulaşılamazsa
--     sonra tekrar dener. 'processing' satır önce 'issued' olur, işaret
--     üstünde kaldığı için hemen ardından iptal edilir.
--   * Daha önce denenmiş ama kesilememiş satırlar ('failed',
--     'needs_attention') değişmez: işçi bunları iptal edilmiş sipariş için
--     zaten kesmez, "Sipariş iptal edilmiş." diyerek bir insana bırakır.
--
-- Geriye dönük uyumlu: yeni, boş (null) bir kolon, yeni bir trigger ve yeni
-- bir fonksiyon. Mevcut kolon, fonksiyon ve imzalar değişmez; eski kod yeni
-- kolonu görmezden gelir.

alter table public.invoices
  add column cancel_requested_at timestamptz;

comment on column public.invoices.cancel_requested_at is
  'Sipariş iptal edildiğinde dolar; uygulama faturayı QNB''de iptal edip status''u cancelled yapar.';

-- Cancellation sweep: issued rows waiting to be cancelled. Partial, so it
-- holds only the handful of rows in flight, never the issued history.
create index invoices_cancel_due_idx on public.invoices (next_attempt_at)
  where status = 'issued' and cancel_requested_at is not null;

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

create trigger orders_cancel_invoice
  after update of status on public.orders
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function request_invoice_cancel_on_order_cancel();

-- Atomically hand up to p_limit due cancellations to one worker. skip locked
-- + locked_until keep two workers (payment hook, order cancel hook, cron)
-- from cancelling the same invoice at once.
create or replace function claim_invoice_cancellations(p_limit integer)
returns setof invoices
language sql
security definer
set search_path = public
as $$
  update invoices
  set locked_until = now() + interval '5 minutes',
      updated_at = now()
  where id in (
    select id from invoices
    where status = 'issued'
      and cancel_requested_at is not null
      and next_attempt_at <= now()
      and (locked_until is null or locked_until < now())
    order by next_attempt_at
    limit least(greatest(p_limit, 1), 50)
    for update skip locked
  )
  returning *;
$$;

revoke all on function claim_invoice_cancellations(integer) from public;
revoke all on function claim_invoice_cancellations(integer) from anon, authenticated;
grant execute on function claim_invoice_cancellations(integer) to service_role;
