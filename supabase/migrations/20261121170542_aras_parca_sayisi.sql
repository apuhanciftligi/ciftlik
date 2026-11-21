-- aras_parca_sayisi
--
-- Aras hesabımız "Parça Bazlı": şube, her kolinin etiketindeki parça
-- barkodunu okutur ve bu barkodun SetOrder'da PieceDetails içinde önceden
-- bildirilmiş olması gerekir. Sadece entegrasyon kodunu basan ilk etiketler bu
-- yüzden şubede tanınmadı. Artık siparişi kaç koli olarak gönderdiğimizi
-- saklıyoruz; etiket sayfası her koli için bir etiket basar (barkodlar bu
-- sayıdan ve entegrasyon kodundan türetilir).
--
-- Boş olabilir: eski yöntemle (parçasız) gönderilmiş siparişler null kalır ve
-- etiket için tekrar gönderilmeleri gerekir. Mevcut tablo, yeni kolon: RLS ve
-- grant'lar orders tablosundan aynen geçerli; eski koda dokunmaz.

alter table orders
  add column aras_piece_count smallint
    check (aras_piece_count is null or aras_piece_count between 1 and 20);

comment on column orders.aras_piece_count is
  'How many parcels (PieceDetails) the order was sent to Aras Kargo with. Null until sent, or if sent before piece-based sending.';
