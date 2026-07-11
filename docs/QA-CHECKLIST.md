# Manuel QA Kontrol Listesi

## Oturum

- E-posta ile OTP giriş.
- Kullanıcı adı ile OTP giriş.
- Kayıt, gizli hesap seçimi ve 6 haneli kod doğrulama.

## Onboarding

- Yeni kullanıcıda başlangıç rehberi görünür.
- Profil düzenle, haritada başla, akışa git ve kullanıcı ara aksiyonları doğru ekrana yönlendirir.
- Rehber küçültme, kapatma ve "Bunu yaptım" durumları sayfa yenileyince korunur.
- Küçültülen rehber balonu sürüklenebilir ve tıklayınca rehberi yeniden açar.
- Kapatılan rehber küçük Rehber kısayoluyla yeniden açılır; küçültülmüş balonla aynı görünmez.
- Kullanıcı 5 onboarding adımı arasında chip, önceki ve sonraki kontrolleriyle geçiş yapabilir.
- Tamamlanan manuel adımlar için işareti kaldırma çalışır.
- 5 adım tamamlanınca rehber tamamlandı mesajı ve "Rehberi bitir" aksiyonu görünür.
- Discovery/detail ekranı açıkken rehber araya girmez.

## Harita ve not

- Mekan arama, Google sonucu seçme, POI tıklama ve sosyal marker tıklama.
- Not başlığı, puan, ziyaret tarihi ve en fazla 3 fotoğrafla kayıt.
- Mekanı listeye kaydetme modalı.
- Konum izni reddedildiğinde mesaj ve yeniden merkezleme.

## Detail / modal katmanları

- Mekan detayından not detayına, kullanıcıya ve tekrar not detayına geçiş.
- Mobilde header ve bottom nav'ın routed sayfaların üzerinde kalması.
- Not ekle, not düzenle, koleksiyon düzenle ve mekan kaydet modallarının chrome üstünde kalması.
- Profil düzenlemenin header/nav altında kalması; kapatma ve çıkış düğmesinin scroll ile erişilebilir olması.
- Fotoğraf lightbox'ın en üstte kalması.

## Gizlilik / sosyal

- Gizli hesap kilidi arama, profil ve koleksiyon başlıklarında görünür.
- Gizli hesap takip isteği, kabul/red, bildirim okuma.
- Kabul edilmemiş gizli profilin not/fotoğraf/koleksiyon sekmelerinin kilitli olması.

## Fotoğraf

- Profil fotoğrafı ekle/değiştir/kaldır.
- Not fotoğrafı ekleme, not düzenlemede ekleme/silme.
- Profil, akış, not detayı ve mekan galerisinde signed URL görselleri.

## Ekran boyutları

- Android Chrome ve iOS Safari.
- Uzun kullanıcı/mekan adı.
- Klavye açıkken not ve profil düzenleme.
- Dar mobilde mekan istatistiklerinin üçlü satırda kalması.
