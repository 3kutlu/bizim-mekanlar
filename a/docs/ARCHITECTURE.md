# Mimari Notlar

## Uygulama akışı

`AppRoot` yalnızca global oturum, profil özeti, bildirim merkezi, ana sekmeler ve discovery stack koordinasyonunu yönetir. Ekranların iç veri yükleme ve etkileşim mantığı feature modüllerinde kalır.

Discovery stack, ekranları mounted tutar. Bu nedenle harita, akış ve profil scroll/state davranışı korunur; global header ve mobil alt navigasyon stack'in dışındadır.

## Katman sözleşmesi

`src/css/tokens.css` tek katman kaynağıdır:

| Katman | Token | Amaç |
| --- | --- | --- |
| Sayfa / routed detail | `--z-page-content` | Harita, profil, not ve mekan ekranları |
| Profil düzenleme | `--z-profile-modal` | Header ve mobil nav altında kalır |
| Global chrome | `--z-global-chrome` | Header ve mobil alt navigasyon |
| Aktif işlem modalı | `--z-action-modal` | Not ekle/düzenle, mekan kaydet, koleksiyon düzenle |
| Görsel lightbox | `--z-photo-lightbox` | Her katmanın üstünde |

Yeni modal eklenirken önce bu beş katmandan hangisine ait olduğu seçilmelidir. Ayrı, sayısal z-index patch'i eklenmemelidir.

## Harita modülü

- `MapPage.jsx`: harita ekranına ait state, seçilen mekan ve modal akışları.
- `MapWidgets.jsx`: marker, autocomplete, harita POI click handler, kartlar, save sheet ve not modalı.
- `mapUtils.js`: Google Place/DB row dönüştürmeleri, cluster hesapları, not ve liste payload doğrulaması.

## Fotoğraf modülü

`notePhotos.js` not fotoğraflarını; `profilePhotos.js` profil fotoğraflarını yönetir. İkisi de private bucket + signed URL modelini korur. UI modülleri Storage path bilgisi üretmez; yalnızca bu yardımcıları çağırır.

## Geriye uyumluluk

`src/pages/AuthPage.jsx`, `src/pages/MapPage.jsx`, `src/pages/UserProfilePage.jsx` ve `src/pages/UserSearchPage.jsx` ince re-export noktalarıdır. Eski import yolu kullanan bir dosya varsa kırılmaz; yeni geliştirmeler doğrudan `src/features` altında yapılmalıdır.
