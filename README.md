# Bizim Mekanlar

Mobil odaklı mekan günlüğü ve sosyal keşif uygulaması.

Bu paket **v2.2.0 — Stabilizasyon + Koleksiyonlar** sürümüdür. V2.1.1 teknik refactor üzerine gelir; not tarihi, kaydetme hataları ve koleksiyon akışını güçlendirir.

## Kurulum sırası

1. Supabase SQL Editor’da şu migration’ı çalıştır:

```text
supabase/migrations/20260703_v2_2_0_stabilization_collections.sql
```

2. Paket içindeki proje dosyalarını mevcut proje köküne taşı.
3. Kendi `.env.local` dosyanı koru.
4. Kontrol et:

```bash
npm ci
npm run check
npm run dev
```

## V2.2.0 kapsamı

### Stabilizasyon

- Not oluşturma ve not düzenleme tarih alanları Türkiye/Istanbul takvimini kullanır.
- İlgili PostgreSQL function’ları da `Europe/Istanbul` saat dilimine bağlanır; gece yarısı sonrası yanlış “gelecek tarih” hatası önlenir.
- Yeni not kaydında not oluşturma ile fotoğraf yükleme aşamaları ayrıldı.
  - Not oluşturma başarısızsa net not hatası görünür.
  - Not kaydolup fotoğraf aşaması başarısız olursa modal açık kalır; fotoğrafı tekrar denemek mümkündür.
  - Storage, metadata/RPC ve temizlik hataları ayrı mesajlarla görünür.
- Koleksiyon kaydetme ve düzenleme hataları daha okunabilir hale getirildi.

### Koleksiyonlar

- Kendi özel koleksiyonunu oluşturma.
- Koleksiyon adı, kısa açıklama, sembol ve görünürlük ayarı.
- Özel koleksiyonu silme; mekanların ve notların silinmez.
- Koleksiyona, o koleksiyondaki mekanlara ait **kendi not fotoğraflarından** kapak seçme.
- Koleksiyon kartlarında kapak, açıklama, mekan sayısı ve görünürlük gösterimi.
- Dış profillerde görünür koleksiyonların kapak ve açıklaması.
- Hazır listelere açıklama eklendi:
  - Gitmek istiyorum
  - Favoriler
  - Tekrar giderim
  - Bir daha gitmem
- Hazır listelerin kullanıcı tarafından düzenlenen adları ve sembolleri artık liste yüklenirken geri ezilmez.

Koleksiyon kapakları yeni bir Storage bucket kullanmaz; mevcut özel `note-photos` bucket’ındaki erişilebilir not fotoğraflarını kullanır.

## Ortam değişkenleri

`VITE_SUPABASE_URL` ve `VITE_SUPABASE_PUBLISHABLE_KEY` istemci Supabase bağlantısı için kullanılır. Harita için `VITE_GOOGLE_MAPS_API_KEY` ile `VITE_GOOGLE_MAP_ID` gerekir. Gerçek anahtarları Git’e ekleme.

## Kod yapısı

- `src/features/app`: uygulama kabuğu, navigasyon koordinasyonu ve ortak UI yardımcıları.
- `src/features/map`: harita ekranı; sayfa durumu, görsel widget’lar ve saf harita yardımcıları.
- `src/features/notes`: akış kartları, not detayı, reaksiyonlar, not düzenleme ve fotoğraf işlemleri.
- `src/features/profile`: kendi profilin, sekmeler ve profil düzenleme.
- `src/features/discovery`: kullanıcı arama ve dış profil.
- `src/features/collections`: mekan listesi düzenleme, liste detayı ve profil koleksiyonları.
- `src/features/places`: mekan detay ve mekan fotoğraf galerisi.
- `src/css/tokens.css`: ortak katman/z-index ve güvenli alan kuralları.
- `src/utils`: tarih, Storage fotoğraf yardımcıları, hata eşleme ve mekan kategorisi eşlemesi.

Dışarıdan kullanılan eski `src/pages/*` girişleri, ilgili feature modüllerine ince re-export olarak korunur.

## Supabase Edge Function

Passwordless OTP Edge Function kaynak kodu:

```text
supabase/functions/request-auth-otp/index.ts
```

Deploy komutu:

```bash
supabase functions deploy request-auth-otp
```

Function için Supabase ortamında `SUPABASE_URL` ve ilgili publishable/secret key değişkenleri tanımlı kalmalıdır.

## V2.1.1 teknik refactor özeti

- Büyük uygulama kökü alanlara ayrıldı.
- Harita ekranı sayfa / widget / saf yardımcı katmanlarına ayrıldı.
- Eski kullanılmayan Vite örnek dosyaları temizlendi.
- Modal katman patch dosyası kaldırıldı; z-index ve safe-area davranışları tek token sistemine taşındı.
- Lint yapılandırması, `.env.example`, `.gitignore`, backend contract dokümanı ve QA kontrol listesi eklendi.
