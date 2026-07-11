# Google Maps Artık Sosyal Bir Platform Oldu

# Bizim Mekanlar 


> Mekanları keşfetmek, not almak, fotoğraf eklemek ve arkadaşlarınla paylaşmak için geliştirilen sosyal mekan günlüğü.

**Bizim Mekanlar**, kafe, restoran, bar ve benzeri mekanları kişisel notlarınla kaydedebileceğin; takip ettiklerinin deneyimlerini görebileceğin mobil öncelikli bir web uygulamasıdır.

> Bu proje aktif olarak geliştirilmektedir. Hata, öneri veya fikirler için: [3kutlu@gmail.com](mailto:3kutlu@gmail.com?subject=Bizim%20Mekanlar%20Geri%20Bildirim)

---

## Uygulamayı Nasıl Kullanırım

[Bizim Mekanlar](https://bizimmekanlar.com/) tarayıcıdan açılabilir ve telefon ana ekranına eklenebilir.

### iPhone / Safari

1. Uygulama linkini **Safari** ile aç.
2. Alt menüdeki **Paylaş** simgesine dokun.
3. **Ana Ekrana Ekle** seçeneğine bas.
4. **Ekle** diyerek tamamla.

### Android / Chrome

1. Uygulama linkini **Chrome** ile aç.
2. Sağ üstteki **üç nokta** menüsüne dokun.
3. **Ana ekrana ekle** veya **Uygulamayı yükle** seçeneğini seç.
4. Onayla.

Ana ekrana eklendikten sonra uygulama normal bir mobil uygulama gibi açılır.

---

## Neler Yapılabilir?

- Google Maps üzerinde mekan aramak ve seçmek
- Mekanlara puan, başlık, detay ve fotoğraf içeren notlar eklemek
- Aynı mekana tekrar ziyaret notları bırakmak
- Mekanları kişisel listelere/koleksiyonlara kaydetmek
- Profil, fotoğraf galerisi ve mekan listelerini görüntülemek
- Kullanıcıları takip etmek ve gizli hesaplar için takip isteği göndermek
- Takip edilen kişilerin son notlarını akışta görmek
- Not tepkileri, takip istekleri ve takip aktiviteleri için uygulama içi bildirim almak
- Uygun cihazlarda web push bildirimlerini açmak
- Profil, mekan, not ve koleksiyon bağlantılarını paylaşmak

---

## Teknoloji Yığını

| Alan | Kullanılan Teknolojiler |
| --- | --- |
| Frontend | React, Vite, JavaScript |
| Stil | Plain CSS |
| Hosting | Vercel |
| Backend | Supabase |
| Kimlik doğrulama | Supabase Auth + Email OTP |
| Veritabanı | Supabase Postgres |
| Dosya depolama | Supabase Storage |
| Gerçek zamanlı veri | Supabase Realtime |
| Sunucu tarafı akışlar | Supabase Edge Functions |
| Harita / mekan arama | Google Maps JavaScript API + Places API |
| PWA | Web App Manifest + Service Worker |
| Bildirim | Web Push + tarayıcı izinleri |
| E-posta | Custom SMTP / transactional email altyapısı |

---

## Platform ve Entegrasyon Diyagramı

![Bizim Mekanlar - Platform ve Entegrasyon Diyagramı](./docs/bizim_mekanlar_platform_mimarisi.png)

Diyagramın kısa özeti:

1. Kullanıcılar uygulamayı iPhone/Safari, Android/Chrome veya masaüstü tarayıcı üzerinden açar.
2. React + Vite ile geliştirilen frontend Vercel üzerinde yayınlanır.
3. Oturum, kullanıcı profilleri, notlar, koleksiyonlar, takip ilişkileri ve bildirim verileri Supabase üzerinden yönetilir.
4. Profil ve not fotoğrafları Supabase Storage içinde saklanır.
5. Harita, mekan arama ve mekan seçimi Google Maps Platform ile sağlanır.
6. Push bildirimleri, OTP e-postaları ve bazı sunucu tarafı akışlar Edge Functions ve bildirim/e-posta entegrasyonları üzerinden ilerler.
7. Uygulama PWA olarak çalışır; desteklenen cihazlarda ana ekrana eklenebilir.

---

## Yerel Geliştirme

### Gereksinimler

- Node.js 20+ önerilir
- npm
- Supabase projesi
- Google Cloud projesi ve Maps / Places API erişimi

### Kurulum

```bash
git clone <REPOSITORY_URL>
cd bizim-mekanlar
npm install
npm run dev
```

Uygulama varsayılan olarak Vite tarafından verilen yerel adreste açılır.

---

## Ortam Değişkenleri

Proje kökünde `.env.local` dosyası oluştur:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_GOOGLE_MAPS_API_KEY=...
VITE_GOOGLE_MAP_ID=...
VITE_VAPID_PUBLIC_KEY=...
```

### Güvenlik Notu

Frontend tarafında kullanılan Google Maps API key'i mutlaka:

- yalnızca izin verilen domainlerle,
- yalnızca kullanılan Maps API'leriyle,
- localhost geliştirme adresleriyle

kısıtlanmalıdır.

Supabase tarafında da RLS, RPC yetkileri, Storage policy'leri ve Edge Function secret'ları dikkatle yapılandırılmalıdır.

---

## Supabase Tarafında Kullanılan Başlıca Alanlar

- **Auth:** Passwordless email OTP oturum akışı
- **Postgres:** Kullanıcılar, mekanlar, notlar, takip ilişkileri, koleksiyonlar ve bildirimler
- **Storage:** Profil fotoğrafları ve not fotoğrafları
- **Realtime:** Takip ve bildirim değişikliklerini uygulama içinde güncellemek
- **Edge Functions:** Web push gönderimi, güvenli sunucu tarafı işlemler ve entegrasyon akışları

---

## Google Maps Kullanımı

Uygulama şu Google Maps Platform servislerini kullanır:

- **Maps JavaScript API:** Haritanın görüntülenmesi
- **Places API:** Mekan arama, autocomplete ve mekan detayları

API key kısıtları yapılmadan üretim ortamında kullanılmamalıdır.

---

## PWA ve Bildirimler

Bizim Mekanlar PWA olarak çalışır:

- Ana ekrana eklenebilir
- Service worker kullanır
- Desteklenen cihazlarda web push bildirimleri sunar
- iPhone/iPad cihazlarda push bildirimleri için uygulamanın ana ekrandan açılması gerekebilir

Bildirim izni kullanıcı deneyimini bozmamak için kontrollü bir akışla istenir. Kullanıcı izinleri daha sonra uygulama içindeki bildirim ayarlarından yönetebilir.

---

## Proje Durumu

Bu proje aktif geliştirme aşamasındadır.

Öncelikli geliştirme başlıkları:

- Harita ve keşif filtreleri
- Yakındaki mekanlar
- Kişisel / sosyal marker ayrımları
- Fotoğraf sıkıştırma ve optimizasyon
- Mekan tekrar ziyaret geçmişi
- Keşif ve rastgele mekan seçimi
- Bundle optimizasyonu ve lazy loading

---

## Geri Bildirim

Bir hata, öneri veya fikir için:

[3kutlu@gmail.com](mailto:3kutlu@gmail.com?subject=Bizim%20Mekanlar%20Geri%20Bildirim)

---

## Lisans

Bu repository şu an kişisel proje / geliştirme deposu olarak tutulmaktadır. Tüm hakları saklıdır.
