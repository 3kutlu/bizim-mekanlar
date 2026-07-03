# Bizim Mekanlar — v3.1.0 Deep Links + Native Back

Bu paket, mevcut v3.0.0 çalışan projeye gerçek URL tabanlı navigasyon ekler. Arayüz ve mevcut özellikler korunur; detay ekranlarındaki sayfa içi `Geri` düğmeleri kaldırılır.

## Eklenen URL yapısı

```text
/user/:username?profile=:publicId
/place/:publicId
/note/:publicId
/collection/:publicId
```

Örnek:

```text
/user/smoke?profile=4f729b66-5b2a-4e84-9580-61b5c78e7e79
/place/4f729b66-5b2a-4e84-9580-61b5c78e7e79
/note/4f729b66-5b2a-4e84-9580-61b5c78e7e79
/collection/4f729b66-5b2a-4e84-9580-61b5c78e7e79
```

`PublicId` değerleri UUID'dir; sıralı veritabanı ID'leri URL'lere çıkmaz.

Profil URL'sindeki `profile` query parametresi özellikle önemlidir:

- Kullanıcının görünen adresi hâlâ `/user/kullaniciadi` şeklindedir.
- Paylaşılan link, hesap sahibini gizli UUID ile doğrular.
- Kullanıcı adını değiştiren kişi eski adı yeniden boşa çıkarabilir.
- Eski adı daha sonra başka biri alsa bile eski paylaşılan link yeni kişiyi açmaz; standart “sayfa bulunamadı” ekranına gider.

## Uygulama adımları

1. Supabase SQL Editor'da şu migration'ı **bir kez** çalıştır:

   ```text
   supabase/migrations/20260703_v3_1_0_deep_links.sql
   ```

   `v2.1.1.2` soft-delete migration'ını daha önce çalıştırmadıysan onu önce çalıştır:

   ```text
   supabase/migrations/20260703_v2_1_1_2_note_photo_soft_delete.sql
   ```

2. Paket dosyalarını proje köküne taşı. `.env.local` dosyanı koru.
3. `vercel.json` proje kökünde kalmalı. Bu dosya, doğrudan açılan `/user/...`, `/place/...`, `/note/...` ve `/collection/...` adreslerini Vite uygulamasına yönlendirir.
4. Kontrol et:

   ```bash
   npm ci
   npm run check
   npm run dev
   ```

## Davranış

- Android sistem geri tuşu ve tarayıcı geri hareketi, önce uygulama içindeki geçmiş ekranına döner.
- Safari/iOS tarafında tarayıcının sol kenardan geri hareketi aynı geçmiş kaydını kullanır.
- Doğrudan paylaşılan detay linki açıldığında uygulama önce bir iç harita geçmişi oluşturur; ilk geri hareketinde siteyi kapatmak yerine haritaya döner.
- Kendi profilinde **Profilini paylaş**, mekan detayında **Paylaş** düğmesi vardır. Destekleyen cihazlarda native share sheet, diğerlerinde link kopyalama çalışır.
- Not ve koleksiyon URL'leri de doğrudan açılabilir; mevcut gizlilik kuralları korunur. Yetkisiz özel not/koleksiyon standart bulunamadı ekranına düşer.

## Supabase değişikliği

Yeni bucket, Storage policy veya RLS policy yoktur. Migration yalnızca şu tablolara `PublicId` ekler ve güvenli hedef çözümleme RPC'lerini oluşturur:

- `Users`
- `Places`
- `PlaceNotes`
- `UserPlaceLists`
