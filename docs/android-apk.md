# Android uygulaması (APK)

Uygulama ayrı bir yazılım değil: `apuhanciftligi.com`'u adres çubuğu olmadan, tam ekran açan ince bir kabuk (Trusted Web Activity). Site yayınlandığında uygulama da güncellenmiş olur; yeni APK dağıtmaya gerek kalmaz. Açılış sayfası `/admin`.

## APK üretmek

```bash
pnpm android:apk
```

Çıktı: `mobile/android-build/apuhan-<sürüm>.apk`. Gerekenler: JDK 17, Android SDK (Android Studio ile gelen yeterli) ve imza anahtarı.

Ayarlar `mobile/twa-manifest.json` içinde. Yeni bir APK dağıtırken `appVersionCode`'u bir artır, yoksa telefon eski sürümün üzerine kurmaz.

## İmza anahtarı — kaybetme

Anahtar repoda **değil**: `~/.apuhan-android/apuhan-release.keystore`, şifresi aynı klasördeki `keystore.env` içinde. Bu klasörü güvenli bir yere yedekle.

Anahtar kaybolursa aynı uygulamanın güncellemesi yapılamaz: yeni anahtarla imzalanan APK kurulmadan önce telefondaki eski uygulamanın silinmesi gerekir ve yeni parmak izinin `shared/android-app.ts`'e **eklenmesi** gerekir.

## Adres çubuğu görünüyorsa

Chrome, uygulamayı siteyle eşleştirmek için `https://apuhanciftligi.com/.well-known/assetlinks.json` adresine bakar. Orada `shared/android-app.ts`'teki paket adı ve parmak izi yoksa (veya APK başka bir anahtarla imzalandıysa) uygulama çalışır ama üstte adres çubuğu çıkar.

Kontrol:

```bash
curl -s https://apuhanciftligi.com/.well-known/assetlinks.json
```

## Telefona kurmak

APK dosyasını telefona gönder (WhatsApp, Drive, kablo), dosyaya dokun, "bilinmeyen kaynaklardan yükleme" iznini ver. Telefonda Chrome kurulu ve güncel olmalı.

## Bildirimler (push)

Panele düşen her bildirim (yeni sipariş, düzenli sipariş talebi, vadesi gelen anımsatıcı) telefona da push bildirimi olarak gider. Uygulamada bildirimler 1.2.0 sürümüyle açıldı (`enableNotifications: true`): Chrome bu bildirimleri uygulamaya devreder, telefonda "Apuhan" adıyla ve simgesiyle görünür.

Sunucu tarafında bir kez kurulur — Vercel → Settings → Environment Variables (Production), sonra yeniden yayın:

| Değişken | Değer |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `~/.apuhan-android/vapid.env` içindeki aynı satır |
| `VAPID_PRIVATE_KEY` | aynı dosyadan — **gizli**, repoya yazılmaz |

Anahtar çifti `npx web-push generate-vapid-keys` ile üretilir. Anahtarı değiştirirsen her cihaz bildirimi yeniden açmak zorunda kalır, o yüzden `vapid.env`'i keystore ile birlikte yedekle.

Her cihazda bir kez: panelde zil simgesi → **Bu cihaza bildirim gönder** anahtarını aç → izin ver. Hemen "Bildirimler açık" diye bir deneme bildirimi gelir; gelmezse anahtar kapalı kalır ve hata mesajı çıkar.

Bilinen sınır: anımsatıcı bildirimleri, panel bir cihazda açıkken (ya da açıldığında) üretilir. Hiçbir cihazda panel açık değilken vadesi gelen anımsatıcı, panel ilk açıldığında gelir. Sipariş ve düzenli sipariş bildirimleri panelden bağımsız, anında gelir.
