export const MESSAGE_KEY = Object.freeze({
  UNKNOWN_ERROR: "UNKNOWN_ERROR",

  SESSION_LOAD_FAILED: "SESSION_LOAD_FAILED",
  PROFILE_LOAD_FAILED: "PROFILE_LOAD_FAILED",
  PROFILE_RECORD_MISSING: "PROFILE_RECORD_MISSING",
  PROFILE_UPDATE_FAILED: "PROFILE_UPDATE_FAILED",
  PROFILE_FIRST_NAME_REQUIRED: "PROFILE_FIRST_NAME_REQUIRED",
  PROFILE_BIRTH_DATE_REQUIRED: "PROFILE_BIRTH_DATE_REQUIRED",
  PROFILE_CITY_REQUIRED: "PROFILE_CITY_REQUIRED",
  PROFILE_USERNAME_MUST_BE_AVAILABLE: "PROFILE_USERNAME_MUST_BE_AVAILABLE",

  USERNAME_INVALID_FORMAT: "USERNAME_INVALID_FORMAT",
  USERNAME_CHECK_FAILED: "USERNAME_CHECK_FAILED",
  USERNAME_CURRENT: "USERNAME_CURRENT",
  USERNAME_AVAILABLE: "USERNAME_AVAILABLE",
  USERNAME_TAKEN: "USERNAME_TAKEN",

  AUTH_EMAIL_PASSWORD_REQUIRED: "AUTH_EMAIL_PASSWORD_REQUIRED",
  AUTH_PASSWORD_MIN_LENGTH: "AUTH_PASSWORD_MIN_LENGTH",
  AUTH_BIRTH_DATE_REQUIRED: "AUTH_BIRTH_DATE_REQUIRED",
  AUTH_BIRTH_DATE_FUTURE: "AUTH_BIRTH_DATE_FUTURE",
  AUTH_CITY_REQUIRED: "AUTH_CITY_REQUIRED",
  AUTH_USERNAME_MUST_BE_AVAILABLE: "AUTH_USERNAME_MUST_BE_AVAILABLE",
  AUTH_ACCOUNT_CREATED_VERIFY_EMAIL: "AUTH_ACCOUNT_CREATED_VERIFY_EMAIL",
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_USER_ALREADY_REGISTERED: "AUTH_USER_ALREADY_REGISTERED",
  AUTH_EMAIL_NOT_CONFIRMED: "AUTH_EMAIL_NOT_CONFIRMED",
  AUTH_PROFILE_CREATE_FAILED: "AUTH_PROFILE_CREATE_FAILED",
  AUTH_SUBMIT_FAILED: "AUTH_SUBMIT_FAILED",

  CITIES_LOAD_FAILED: "CITIES_LOAD_FAILED",
  NOTIFICATIONS_LOAD_FAILED: "NOTIFICATIONS_LOAD_FAILED",
  FOLLOW_ACTIVITY_LOAD_FAILED: "FOLLOW_ACTIVITY_LOAD_FAILED",
  NOTE_NOTIFICATIONS_MARK_READ_FAILED: "NOTE_NOTIFICATIONS_MARK_READ_FAILED",
  FOLLOW_ACTIVITY_MARK_READ_FAILED: "FOLLOW_ACTIVITY_MARK_READ_FAILED",

  PLACE_TARGET_INVALID: "PLACE_TARGET_INVALID",
  PLACE_TARGET_LOAD_FAILED: "PLACE_TARGET_LOAD_FAILED",
  PLACE_TARGET_LOCATION_INVALID: "PLACE_TARGET_LOCATION_INVALID",

  FOLLOW_REQUEST_RESPONSE_FAILED: "FOLLOW_REQUEST_RESPONSE_FAILED",
  FOLLOW_REQUEST_INVALID: "FOLLOW_REQUEST_INVALID",
  FOLLOW_ACTION_FAILED: "FOLLOW_ACTION_FAILED",

  FEED_LOAD_FAILED: "FEED_LOAD_FAILED",
  NOTES_LOAD_FAILED: "NOTES_LOAD_FAILED",
  COLLECTION_LOAD_FAILED: "COLLECTION_LOAD_FAILED",
  NOTE_LOAD_FAILED: "NOTE_LOAD_FAILED",
  NOTE_NOT_FOUND_OR_RESTRICTED: "NOTE_NOT_FOUND_OR_RESTRICTED",
  EXTERNAL_PROFILE_LOAD_FAILED: "EXTERNAL_PROFILE_LOAD_FAILED",
  USER_NOT_FOUND_OR_INACTIVE: "USER_NOT_FOUND_OR_INACTIVE",
  USER_SEARCH_FAILED: "USER_SEARCH_FAILED",
  PLACE_REVIEWS_LOAD_FAILED: "PLACE_REVIEWS_LOAD_FAILED",

  NOTE_TITLE_REQUIRED: "NOTE_TITLE_REQUIRED",
  NOTE_RATING_REQUIRED: "NOTE_RATING_REQUIRED",
  NOTE_DETAIL_REQUIRED: "NOTE_DETAIL_REQUIRED",
  NOTE_SAVE_FAILED: "NOTE_SAVE_FAILED",
  NOTE_DELETE_FAILED: "NOTE_DELETE_FAILED",
  NOTE_DELETE_NOT_ALLOWED: "NOTE_DELETE_NOT_ALLOWED",
  NOTE_VISIT_DATE_FUTURE: "NOTE_VISIT_DATE_FUTURE",
  NOTE_CREATE_STAGE_FAILED: "NOTE_CREATE_STAGE_FAILED",
  NETWORK_REQUEST_FAILED: "NETWORK_REQUEST_FAILED",
  PLACE_LIST_SAVE_FAILED: "PLACE_LIST_SAVE_FAILED",
  COLLECTION_SAVE_FAILED: "COLLECTION_SAVE_FAILED",
  COLLECTION_DELETE_FAILED: "COLLECTION_DELETE_FAILED",
  COLLECTION_NAME_EXISTS: "COLLECTION_NAME_EXISTS",
  COLLECTION_SYSTEM_DELETE_BLOCKED: "COLLECTION_SYSTEM_DELETE_BLOCKED",
  COLLECTION_NAME_INVALID: "COLLECTION_NAME_INVALID",
  COLLECTION_DESCRIPTION_INVALID: "COLLECTION_DESCRIPTION_INVALID",
  COLLECTION_ICON_INVALID: "COLLECTION_ICON_INVALID",
  COLLECTION_VISIBILITY_INVALID: "COLLECTION_VISIBILITY_INVALID",
  COLLECTION_NOT_FOUND: "COLLECTION_NOT_FOUND",
  COLLECTION_COVER_INVALID: "COLLECTION_COVER_INVALID",
  PLACE_DATA_INCOMPLETE: "PLACE_DATA_INCOMPLETE",
  PLACE_LOCATION_INVALID: "PLACE_LOCATION_INVALID",
  PLACE_SUGGESTIONS_LOAD_FAILED: "PLACE_SUGGESTIONS_LOAD_FAILED",
  PLACE_SELECTION_FAILED: "PLACE_SELECTION_FAILED",
  PLACE_CATEGORY_INVALID: "PLACE_CATEGORY_INVALID",
  MAPS_API_KEY_MISSING: "MAPS_API_KEY_MISSING",
  MAPS_ID_MISSING: "MAPS_ID_MISSING",

  LOCATION_UNSUPPORTED: "LOCATION_UNSUPPORTED",
  LOCATION_PERMISSION_DENIED: "LOCATION_PERMISSION_DENIED",
  LOCATION_UNAVAILABLE: "LOCATION_UNAVAILABLE",
  LOCATION_TIMEOUT: "LOCATION_TIMEOUT",

  SIGN_OUT_FAILED: "SIGN_OUT_FAILED",

  PROFILE_COLLECTION_NOTES_EMPTY: "PROFILE_COLLECTION_NOTES_EMPTY",
  PROFILE_COLLECTION_FOLLOWERS_EMPTY: "PROFILE_COLLECTION_FOLLOWERS_EMPTY",
  PROFILE_COLLECTION_FOLLOWING_EMPTY: "PROFILE_COLLECTION_FOLLOWING_EMPTY",

  LINK_COPIED: "LINK_COPIED",
  LINK_SHARE_FAILED: "LINK_SHARE_FAILED",
});

const TURKISH_MESSAGES = Object.freeze({
  [MESSAGE_KEY.UNKNOWN_ERROR]:
    "Beklenmeyen bir hata oluştu. Lütfen tekrar dene.",

  [MESSAGE_KEY.SESSION_LOAD_FAILED]: "Oturum bilgilerin yüklenemedi.",
  [MESSAGE_KEY.PROFILE_LOAD_FAILED]: "Profil bilgilerin yüklenemedi.",
  [MESSAGE_KEY.PROFILE_RECORD_MISSING]:
    "Hesabın oluşturuldu fakat profil kaydın bulunamadı. Lütfen yeniden giriş yapmayı dene.",
  [MESSAGE_KEY.PROFILE_UPDATE_FAILED]: "Profil güncellenemedi.",
  [MESSAGE_KEY.PROFILE_FIRST_NAME_REQUIRED]: "İsim zorunlu.",
  [MESSAGE_KEY.PROFILE_BIRTH_DATE_REQUIRED]: "Doğum tarihi zorunlu.",
  [MESSAGE_KEY.PROFILE_CITY_REQUIRED]: "Şehir seçmelisin.",
  [MESSAGE_KEY.PROFILE_USERNAME_MUST_BE_AVAILABLE]:
    "Devam etmek için kullanılabilir bir kullanıcı adı seç.",

  [MESSAGE_KEY.USERNAME_INVALID_FORMAT]:
    "Kullanıcı adı 3-30 karakter olmalı; harf, rakam, nokta veya alt çizgi kullanabilirsin.",
  [MESSAGE_KEY.USERNAME_CHECK_FAILED]:
    "Kullanıcı adı şu an kontrol edilemedi.",
  [MESSAGE_KEY.USERNAME_CURRENT]: "Mevcut kullanıcı adın.",
  [MESSAGE_KEY.USERNAME_AVAILABLE]: "Bu kullanıcı adı kullanılabilir.",
  [MESSAGE_KEY.USERNAME_TAKEN]: "Bu kullanıcı adı alınmış.",

  [MESSAGE_KEY.AUTH_EMAIL_PASSWORD_REQUIRED]:
    "E-posta ve şifre zorunlu.",
  [MESSAGE_KEY.AUTH_PASSWORD_MIN_LENGTH]: "Şifre en az 6 karakter olmalı.",
  [MESSAGE_KEY.AUTH_BIRTH_DATE_REQUIRED]: "Doğum tarihi zorunlu.",
  [MESSAGE_KEY.AUTH_BIRTH_DATE_FUTURE]: "Doğum tarihi gelecekte olamaz.",
  [MESSAGE_KEY.AUTH_CITY_REQUIRED]: "Şehir seçmelisin.",
  [MESSAGE_KEY.AUTH_USERNAME_MUST_BE_AVAILABLE]:
    "Başka bir kullanıcı adı seçmelisin.",
  [MESSAGE_KEY.AUTH_ACCOUNT_CREATED_VERIFY_EMAIL]:
    "Kayıt oluşturuldu. E-posta doğrulama bağlantısını kontrol et.",
  [MESSAGE_KEY.AUTH_INVALID_CREDENTIALS]: "E-posta veya şifre yanlış.",
  [MESSAGE_KEY.AUTH_USER_ALREADY_REGISTERED]: "Bu e-posta zaten kayıtlı.",
  [MESSAGE_KEY.AUTH_EMAIL_NOT_CONFIRMED]:
    "Önce e-posta adresini doğrulaman gerekiyor.",
  [MESSAGE_KEY.AUTH_PROFILE_CREATE_FAILED]:
    "Profil kaydı oluşturulamadı. Bilgileri kontrol edip tekrar dene.",
  [MESSAGE_KEY.AUTH_SUBMIT_FAILED]:
    "Giriş veya kayıt işlemi tamamlanamadı. Lütfen tekrar dene.",

  [MESSAGE_KEY.CITIES_LOAD_FAILED]: "Şehir listesi yüklenemedi.",
  [MESSAGE_KEY.NOTIFICATIONS_LOAD_FAILED]:
    "Bildirimler şu an yüklenemedi.",
  [MESSAGE_KEY.FOLLOW_ACTIVITY_LOAD_FAILED]:
    "Takip hareketleri şu an yüklenemedi.",
  [MESSAGE_KEY.NOTE_NOTIFICATIONS_MARK_READ_FAILED]:
    "Not bildirimleri okundu işaretlenemedi.",
  [MESSAGE_KEY.FOLLOW_ACTIVITY_MARK_READ_FAILED]:
    "Takip gelişmeleri okundu işaretlenemedi.",

  [MESSAGE_KEY.PLACE_TARGET_INVALID]: "Mekan konumu açılamadı.",
  [MESSAGE_KEY.PLACE_TARGET_LOAD_FAILED]:
    "Mekan konumu şu an açılamadı.",
  [MESSAGE_KEY.PLACE_TARGET_LOCATION_INVALID]:
    "Mekan konum bilgisi geçersiz.",

  [MESSAGE_KEY.FOLLOW_REQUEST_RESPONSE_FAILED]:
    "Takip isteği yanıtlanamadı.",
  [MESSAGE_KEY.FOLLOW_REQUEST_INVALID]: "Takip isteği bilgisi geçersiz.",
  [MESSAGE_KEY.FOLLOW_ACTION_FAILED]:
    "Takip işlemi gerçekleştirilemedi.",

  [MESSAGE_KEY.FEED_LOAD_FAILED]: "Akış şu an yüklenemedi. Tekrar dene.",
  [MESSAGE_KEY.NOTES_LOAD_FAILED]: "Notların yüklenemedi. Tekrar dene.",
  [MESSAGE_KEY.COLLECTION_LOAD_FAILED]:
    "Liste şu an yüklenemedi. Tekrar dene.",
  [MESSAGE_KEY.NOTE_LOAD_FAILED]: "Not şu an açılamadı.",
  [MESSAGE_KEY.NOTE_NOT_FOUND_OR_RESTRICTED]:
    "Not bulunamadı veya erişime kapalı.",
  [MESSAGE_KEY.EXTERNAL_PROFILE_LOAD_FAILED]:
    "Profil şu an yüklenemedi.",
  [MESSAGE_KEY.USER_NOT_FOUND_OR_INACTIVE]:
    "Kullanıcı bulunamadı veya artık aktif değil.",
  [MESSAGE_KEY.USER_SEARCH_FAILED]:
    "Kullanıcılar şu an aranamadı. Tekrar dene.",
  [MESSAGE_KEY.PLACE_REVIEWS_LOAD_FAILED]:
    "Bu mekanın yorumları şu an yüklenemedi. Tekrar dene.",

  [MESSAGE_KEY.NOTE_TITLE_REQUIRED]: "Not başlığı zorunlu.",
  [MESSAGE_KEY.NOTE_RATING_REQUIRED]:
    "1 ile 5 arasında bir puan vermelisin.",
  [MESSAGE_KEY.NOTE_DETAIL_REQUIRED]: "Not detayı zorunlu.",
  [MESSAGE_KEY.NOTE_SAVE_FAILED]:
    "Not kaydedilemedi. Lütfen tekrar dene.",
  [MESSAGE_KEY.NOTE_DELETE_FAILED]:
    "Not silinemedi. Lütfen tekrar dene.",
  [MESSAGE_KEY.NOTE_DELETE_NOT_ALLOWED]:
    "Bu not silinemedi veya artık mevcut değil.",
  [MESSAGE_KEY.NOTE_VISIT_DATE_FUTURE]:
    "Ziyaret tarihi Türkiye saatine göre gelecekte olamaz.",
  [MESSAGE_KEY.NOTE_CREATE_STAGE_FAILED]:
    "Not kaydedilemedi. Lütfen bilgileri kontrol edip tekrar dene.",
  [MESSAGE_KEY.NETWORK_REQUEST_FAILED]:
    "Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.",
  [MESSAGE_KEY.PLACE_LIST_SAVE_FAILED]:
    "Mekan listene kaydedilemedi. Tekrar dene.",
  [MESSAGE_KEY.COLLECTION_SAVE_FAILED]:
    "Koleksiyon kaydedilemedi. Tekrar dene.",
  [MESSAGE_KEY.COLLECTION_DELETE_FAILED]:
    "Koleksiyon silinemedi. Tekrar dene.",
  [MESSAGE_KEY.COLLECTION_NAME_EXISTS]:
    "Bu isimde zaten bir koleksiyonun var.",
  [MESSAGE_KEY.COLLECTION_SYSTEM_DELETE_BLOCKED]:
    "Hazır koleksiyonlar silinemez.",
  [MESSAGE_KEY.COLLECTION_NAME_INVALID]:
    "Koleksiyon adı 1 ile 60 karakter arasında olmalı.",
  [MESSAGE_KEY.COLLECTION_DESCRIPTION_INVALID]:
    "Koleksiyon açıklaması en fazla 180 karakter olabilir.",
  [MESSAGE_KEY.COLLECTION_ICON_INVALID]:
    "Koleksiyon sembolü geçersiz.",
  [MESSAGE_KEY.COLLECTION_VISIBILITY_INVALID]:
    "Koleksiyon görünürlüğü geçersiz.",
  [MESSAGE_KEY.COLLECTION_NOT_FOUND]:
    "Koleksiyon bulunamadı veya işlem yapma yetkin yok.",
  [MESSAGE_KEY.COLLECTION_COVER_INVALID]:
    "Kapak olarak yalnızca bu listedeki kendi not fotoğraflarını seçebilirsin.",
  [MESSAGE_KEY.PLACE_DATA_INCOMPLETE]:
    "Mekanın Google'dan gelen adı, adresi veya şehir bilgisi eksik. Lütfen listeden tekrar seç.",
  [MESSAGE_KEY.PLACE_LOCATION_INVALID]:
    "Mekanın konum bilgisi geçersiz.",
  [MESSAGE_KEY.PLACE_SUGGESTIONS_LOAD_FAILED]:
    "Arama sonuçları alınamadı.",
  [MESSAGE_KEY.PLACE_SELECTION_FAILED]: "Mekan seçilemedi.",
  [MESSAGE_KEY.PLACE_CATEGORY_INVALID]:
    "Bu mekan türüne henüz not eklenemiyor.",
  [MESSAGE_KEY.MAPS_API_KEY_MISSING]: "Google Maps API anahtarı bulunamadı.",
  [MESSAGE_KEY.MAPS_ID_MISSING]: "Google Maps Map ID bulunamadı.",

  [MESSAGE_KEY.LOCATION_UNSUPPORTED]:
    "Tarayıcın konum özelliğini desteklemiyor.",
  [MESSAGE_KEY.LOCATION_PERMISSION_DENIED]: "Konum izni verilmedi.",
  [MESSAGE_KEY.LOCATION_UNAVAILABLE]: "Konum bilgisi alınamadı.",
  [MESSAGE_KEY.LOCATION_TIMEOUT]:
    "Konum isteği zaman aşımına uğradı.",

  [MESSAGE_KEY.SIGN_OUT_FAILED]: "Çıkış yapılırken bir hata oluştu.",

  [MESSAGE_KEY.PROFILE_COLLECTION_NOTES_EMPTY]: "Henüz not bulunmuyor.",
  [MESSAGE_KEY.PROFILE_COLLECTION_FOLLOWERS_EMPTY]:
    "Henüz takipçi bulunmuyor.",
  [MESSAGE_KEY.PROFILE_COLLECTION_FOLLOWING_EMPTY]:
    "Henüz takip edilen hesap bulunmuyor.",

  [MESSAGE_KEY.LINK_COPIED]: "Bağlantı kopyalandı.",
  [MESSAGE_KEY.LINK_SHARE_FAILED]:
    "Bağlantı şu an paylaşılamadı. Lütfen tekrar dene.",
});

const MESSAGES_BY_LOCALE = Object.freeze({
  tr: TURKISH_MESSAGES,
});

const LEGACY_ERROR_MESSAGE_TO_KEY = Object.freeze({
  "Invalid login credentials": MESSAGE_KEY.AUTH_INVALID_CREDENTIALS,
  "User already registered": MESSAGE_KEY.AUTH_USER_ALREADY_REGISTERED,
  "Email not confirmed": MESSAGE_KEY.AUTH_EMAIL_NOT_CONFIRMED,
  "Database error saving new user": MESSAGE_KEY.AUTH_PROFILE_CREATE_FAILED,
  "Aktif kullanıcı profili bulunamadı.": MESSAGE_KEY.PROFILE_LOAD_FAILED,
  "Bu kullanıcı adı alınmış.": MESSAGE_KEY.USERNAME_TAKEN,
  "Geçerli bir şehir seç.": MESSAGE_KEY.PROFILE_CITY_REQUIRED,
  "İsim zorunludur.": MESSAGE_KEY.PROFILE_FIRST_NAME_REQUIRED,
});

function applyParams(template, params) {
  return template.replace(/\{(\w+)\}/g, (_match, parameterName) =>
    String(params?.[parameterName] ?? "")
  );
}

function getStructuredErrorKey(error) {
  const candidates = [error?.details, error?.hint, error?.message]
    .filter(Boolean)
    .map((value) => String(value));

  for (const candidate of candidates) {
    const match = candidate.match(/APP_ERROR:([A-Z0-9_]+)/);

    if (match?.[1] && MESSAGE_KEY[match[1]]) {
      return MESSAGE_KEY[match[1]];
    }
  }

  return null;
}

export function t(messageKey, params = {}, locale = "tr") {
  if (!messageKey) {
    return "";
  }

  const dictionary =
    MESSAGES_BY_LOCALE[locale] || MESSAGES_BY_LOCALE.tr;
  const template =
    dictionary[messageKey] ||
    MESSAGES_BY_LOCALE.tr[messageKey] ||
    MESSAGES_BY_LOCALE.tr[MESSAGE_KEY.UNKNOWN_ERROR];

  return applyParams(template, params);
}

export function getErrorMessageKey(error, fallbackKey = MESSAGE_KEY.UNKNOWN_ERROR) {
  if (!error) {
    return fallbackKey;
  }

  if (error?.messageKey && Object.values(MESSAGE_KEY).includes(error.messageKey)) {
    return error.messageKey;
  }

  const structuredKey = getStructuredErrorKey(error);

  if (structuredKey) {
    return structuredKey;
  }

  const legacyKey = LEGACY_ERROR_MESSAGE_TO_KEY[String(error?.message ?? "")];

  return legacyKey || fallbackKey;
}

export function createAppError(messageKey, options = {}) {
  const error = new Error(messageKey);
  error.name = "AppError";
  error.messageKey = messageKey;
  Object.assign(error, options);

  return error;
}
