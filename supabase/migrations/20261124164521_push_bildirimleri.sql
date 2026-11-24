-- push_bildirimleri
--
-- Panel bildirimleri (yeni sipariş, düzenli sipariş talebi, anımsatıcı) artık
-- telefona ve bilgisayara push bildirimi olarak da gider (Web Push / VAPID).
-- Android uygulaması (TWA) bu bildirimleri kendi adıyla gösterir.
--
--   * push_subscriptions: bir adminin "Bildirimleri aç" dediği her tarayıcı /
--     uygulama kurulumu bir satır. Push servisi bir aboneliğin öldüğünü
--     söylediğinde (404/410) satır silinir.
--   * notifications.pushed_at: bir bildirim satırının push'u gönderildi mi?
--     Gönderici "pushed_at boş" satırları UPDATE ... RETURNING ile sahiplenir,
--     bu yüzden aynı anda çalışan iki gönderici aynı bildirimi iki kez atamaz.
--     Bildirimi kim yazdıysa (uygulama kodu ya da veritabanının anımsatıcı
--     fonksiyonu) tek bir yerden gönderilir.
--
-- Geriye dönük uyumlu: sadece yeni tablo ve boş bırakılabilir yeni kolon. Eski
-- kod pushed_at'i bilmez, yazdığı satırlar boş kalır ve yeni kod bunları
-- (yalnızca tazeyse) gönderir.

-- ---- notifications.pushed_at ----------------------------------------------------

alter table notifications add column pushed_at timestamptz;

-- Var olan bildirimler geçmişte kaldı: yayın sonrası ilk gönderim bunları
-- telefona yağdırmasın.
update notifications set pushed_at = created_at where pushed_at is null;

-- Gönderici her seferinde yalnızca bekleyen birkaç satıra bakar; kısmi index
-- tablo ne kadar büyürse büyüsün bu sorguyu küçük tutar (CLAUDE.md §1).
create index notifications_push_pending_idx
  on notifications (created_at) where pushed_at is null;

comment on column notifications.pushed_at is
  'Push bildirimi gönderildiği (ya da bayat diye atlandığı) an; null = henüz gönderilmedi.';

-- ---- push_subscriptions -----------------------------------------------------------

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- Aboneliği açan admin. Hesap silinirse abonelikleri de gider.
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Push servisinin adresi (FCM, Mozilla, Apple…). Bir tarayıcı kurulumu = bir
  -- endpoint; aynı cihaz yeniden abone olursa satır güncellenir.
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 100),
  user_agent text check (length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- on delete cascade'in auth.users tarafından araması için.
create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at
  before update on push_subscriptions
  for each row execute function set_updated_at();

alter table push_subscriptions enable row level security;
create policy push_subscriptions_admin_all on push_subscriptions
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

comment on table push_subscriptions is
  'Admin push bildirimi abonelikleri (Web Push). Gönderim service-role ile yapılır; okuma/yazma admin-only RLS.';
