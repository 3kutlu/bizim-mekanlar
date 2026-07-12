# v2.8.2 — Harita kartından mekan paylaşımı

Bu patch yalnızca paylaşım akışını değiştirir. Ülke/Türkiye kısıtı eklenmemiştir.

## Kurulum

1. Dosyaları proje köküne kopyala.
2. `npx.cmd supabase db push --dry-run`
3. Yalnız `20260712030000_v2_8_2_map_place_sharing.sql` görünüyorsa `npx.cmd supabase db push`
4. `npm run check`
5. `vercel --prod`

Yeni Edge Function yoktur.
