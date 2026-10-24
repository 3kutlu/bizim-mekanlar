BİZİM MEKANLAR - BASELINE RECONCILIATION

Bu paket henüz production üzerinde çalıştırılmamalıdır.

Amaç:
- Güncel v2.11.2 remote şemasını boş bir Supabase projesinde yeniden kurabilmek.
- Remote migration history'deki sekiz version değerini korumak.
- Eski gerçek SQL dosyalarını migrations_archive altında saklamak.

Aktif sıra:
1. 20260702000000_v2_11_2_current_remote_baseline.sql
2. Remote'da zaten kayıtlı sekiz no-op history marker

Production için daha sonra yapılacak tek history işlemi:
  npx supabase migration repair 20260702000000 --status applied --linked

Bu komut baseline SQL'ini production'da çalıştırmaz; yalnız migration history'ye marker ekler.
Komut, paket incelemesi ve boş proje testi tamamlanmadan ÇALIŞTIRILMAMALIDIR.

Manuel ortam adımları:
- Vault: web_push_function_url ve web_push_function_secret değerlerini hedef ortamda oluştur.
- Edge Function secret'larını dashboard'da tanımla.
- Supabase Auth hook ayarını dashboard'dan doğrula/kur.
- Cron şu an yoktur; purge scheduler ayrıca tasarlanmalıdır.
- Storage nesneleri bu baseline'a dahil değildir.
