# Bizim Mekanlar v2.8.1

Bu paket yalnızca değişen dosyaları içerir.

## Değişiklikler

- Paylaşımlar sekmesindeki 100 karakterlik kısa not artık kırpılmadan, çok satırlı gösterilir.
- Uygulama içi içerik paylaşımı Web Push bildirimi olarak gönderilir.
- Ayarlar > Bildirim ayarları bölümüne "Uygulama içi paylaşımlar" tercihi eklenir.
- Tercih kapalıysa paylaşım uygulama içinde görünür, yalnızca telefon push bildirimi gönderilmez.

## Uygulama sırası

```cmd
npx.cmd supabase db push --dry-run
npx.cmd supabase db push
npx.cmd supabase functions deploy send-content-share-push
npm run check
vercel --prod
```

Dry-run çıktısında yalnızca şu yeni migration görünmelidir:

```text
20260712020000_v2_8_1_content_share_push_preferences.sql
```
