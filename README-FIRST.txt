BIZIM MEKANLAR v2.8.0 - UYGULAMA ICI PAYLASIMLAR

Bu paket yalnızca değişen/yeni dosyaları içerir.
Klasör yapısını koruyarak proje köküne kopyala ve mevcut dosyaların üzerine yaz.

Sıra:
1) npx.cmd supabase db push --dry-run
   Yalnız 20260712010000_v2_8_0_content_shares.sql görünmeli.
2) npx.cmd supabase db push
3) npx.cmd supabase functions deploy send-content-share-push
4) npm ci
5) npm run check
6) vercel --prod

Detay: docs/V2.8.0-CONTENT-SHARING.md
