# Bizim Mekanlar Refactor Notes

Bu paket davranış değiştirmeden güvenli refaktör hedefiyle hazırlandı.

## Yapılanlar

- `AppRoot.jsx` içindeki desktop shell/panel ayrı bileşene taşındı: `src/features/app/DesktopMobileShell.jsx`.
- `appShared.jsx` geriye uyumlu barrel olarak bırakıldı; gerçek implementasyon küçük modüllere bölündü:
  - `src/features/app/shared/appConstants.js`
  - `src/features/app/shared/dateFormatters.js`
  - `src/features/app/shared/navigation.jsx`
  - `src/features/app/shared/noteDisplay.jsx`
  - `src/features/app/shared/noteReactions.jsx`
  - `src/features/app/shared/profileHelpers.js`
- Koleksiyon renk normalizasyonu tekrarı ortak yardımcıya taşındı: `src/utils/collectionColors.js`.
- ESLint script ortamı Node global'larını tanıyacak şekilde düzeltildi.
- Var olan lint uyarıları davranış değiştirmeden temizlendi.

## Değiştirilmemesi amaçlanan alanlar

- Supabase RPC isimleri ve payload'ları
- Auth/session akışı
- Bildirim ve push notification akışları
- Harita, mekan kaydetme, not oluşturma/düzenleme/silme akışları
- Profil, private/public ve koleksiyon yetki davranışları
- SQL migration ve Edge Function içerikleri

## Lokal kontrol

Aşağıdaki kontroller bu paket üzerinde çalıştırıldı:

```bash
npm run lint
npm run build
```

Sonuç: ikisi de başarılı. Build sırasında Vite yalnızca mevcut büyük bundle uyarısını veriyor; bu hata değil.
