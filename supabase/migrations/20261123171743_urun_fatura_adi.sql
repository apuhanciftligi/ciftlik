-- urun_fatura_adi
--
-- Ürünlere isteğe bağlı "faturadaki adı" ekler. QNB e-Arşiv faturasının
-- satırında ürün bu adla yazılır; boşsa (null) sitedeki ürün adı
-- (display_name) kullanılır. Amaç, muhasebe kayıtlarıyla eşleşen kısa ve
-- doğru bir ad yazabilmek (ör. "Gezen Tavuk Yumurtası" → "Yumurta").
--
-- Geriye dönük uyumlu: sadece boş (nullable) yeni kolon; mevcut satırlar ve
-- eski kod etkilenmez. products tablosunun RLS politikaları ve tablo
-- düzeyindeki select/update yetkileri yeni kolonu da kapsar. Index yok:
-- kolon filtrelenmiyor, sadece okunuyor.

alter table public.products
  add column invoice_name text
    check (invoice_name is null or char_length(btrim(invoice_name)) between 1 and 100);

comment on column public.products.invoice_name is
  'Faturada yazılacak ürün adı. null = display_name kullanılır.';
