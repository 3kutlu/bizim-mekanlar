# E-posta Domain ve Kayıt Güvenliği Kurulumu

Bu paket mevcut `request-auth-otp` akışına aşağıdaki korumaları ekler:

- Tek tablo: `EmailDomains`
- `AllowedEmailDomain = true`: izin verilen domain
- `AllowedEmailDomain = false`: reddedilen domain
- Bilinmeyen domainleri DeBounce disposable-email servisiyle kontrol edip aynı tabloya kaydetme
- İlk reddedilen e-postada açıklayıcı uyarı
- Aynı cihazdaki ikinci reddedilen denemede 24 saat cihaz engeli
- Üçüncü ve sonraki reddedilen denemelerde 7 gün cihaz engeli
- Aynı IP'den 1 saat içinde 5 reddedilen denemede 1 saat IP engeli
- IP ve cihaz değerlerini açık biçimde değil HMAC-SHA256 hash olarak saklama
- Supabase Auth endpoint'i doğrudan çağrılsa bile bilinen engelli domainleri durduran `Before User Created` hook'u

## 1. SQL migration

Supabase SQL Editor'da şu dosyayı çalıştır:

```text
supabase/migrations/202607130001_email_domain_signup_security.sql
```

Migration başlangıçta yaygın domainleri izinli, `ezimb.com` domainini reddedilmiş olarak ekler.

Yeni bir domaini manuel yönetmek için:

```sql
insert into public."EmailDomains"
(
    "Name",
    "AllowedEmailDomain",
    "SourceCode",
    "LastCheckedDate",
    "IsActive"
)
values
(
    'ornek.com',
    false,
    'MANUAL',
    now(),
    true
)
on conflict ("Name")
do update set
    "AllowedEmailDomain" = excluded."AllowedEmailDomain",
    "SourceCode" = 'MANUAL',
    "LastCheckedDate" = now(),
    "IsActive" = true,
    "UpdatedDate" = now();
```

## 2. Hash secret

Bu adım önerilir. Rastgele ve uzun bir değer üretip Supabase secret olarak ekle:

```bash
supabase secrets set SIGNUP_SECURITY_HASH_SECRET="BURAYA_UZUN_RASTGELE_BIR_DEGER"
```

Secret tanımlanmazsa Edge Function mevcut Supabase secret key'i hash tuzu olarak kullanır; sistem çalışır fakat ayrı secret kullanmak daha temizdir.

## 3. Edge Function deploy

Kayıt ekranı oturum açılmadan çağrıldığı için mevcut akıştaki gibi JWT doğrulaması kapalı deploy et:

```bash
supabase functions deploy request-auth-otp --no-verify-jwt
```

## 4. Before User Created hook

Supabase Dashboard:

```text
Authentication
→ Hooks
→ Before User Created
→ Postgres Function
→ public.BeforeUserCreatedCheckEmailDomain
```

Hook'u etkinleştir. Bu katman bilinen `AllowedEmailDomain = false` domainlerin frontend veya Edge Function atlanarak doğrudan Auth endpoint'inden kaydolmasını engeller.

## 5. Frontend deploy

Güncellenen dosyalar:

```text
src/features/auth/AuthPage.jsx
src/css/auth.css
```

Ardından:

```bash
npm run lint
npm run build
vercel --prod
```

## 6. Kontrol senaryosu

1. Yeni/gizli tarayıcıda `@ezimb.com` ile kayıt dene.
2. İlk denemede OTP gönderilmemeli ve iletişim bağlantılı uyarı görünmeli.
3. Aynı cihazdan ikinci bir reddedilen e-posta dene.
4. Kayıt işlemi geçici olarak engellenmeli.
5. `EmailDomains` tablosunda `ezimb.com / false` kaydı görünmeli.
6. `SignupSecurityEvents` tablosunda `DISALLOWED_EMAIL` ve `DEVICE_BLOCK` kayıtları oluşmalı.
7. Gmail/Outlook/iCloud gibi izinli bir adresle OTP gönderimi normal devam etmeli.

## Mevcut şüpheli kullanıcı

Bu migration yeni kayıtları korur. Daha önce oluşturulmuş kullanıcı otomatik silinmez. Mevcut hesabı uygulama politikasına göre ayrıca pasifleştir veya Supabase Authentication ekranından kaldır.
