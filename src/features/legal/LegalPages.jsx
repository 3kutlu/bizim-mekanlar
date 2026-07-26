import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import "../../css/legal.css";

const LEGAL_VERSION = "2026-07-26";
const TERMS_ACCEPTED_EVENT = "bizim-mekanlar:terms-accepted";
const CONTACT_DEVICE_STORAGE_KEY = "bm_contact_device_v1";

const LEGAL_TABS = Object.freeze([
  { id: "aydinlatma", label: "Aydınlatma" },
  { id: "gizlilik", label: "Gizlilik" },
  { id: "kosullar", label: "Kullanım Koşulları" },
  { id: "depolama", label: "Çerezler ve depolama" },
]);

function getInitialLegalTab() {
  if (typeof window === "undefined") {
    return LEGAL_TABS[0].id;
  }

  const hash = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  return LEGAL_TABS.some((tab) => tab.id === hash)
    ? hash
    : LEGAL_TABS[0].id;
}

function LegalShell({ title, description, hasSession = false, children }) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <a className="legal-back-link" href={hasSession ? "/settings" : "/"}>
          ← {hasSession ? "Ayarlara dön" : "Giriş ekranına dön"}
        </a>
        <p className="legal-brand">BİZİM MEKANLAR</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </header>
      {children}
    </main>
  );
}

function LegalNotice() {
  return (
    <aside className="legal-project-notice">
      <strong>Kişisel, bağımsız ve ticari olmayan proje</strong>
      <p>
        Bizim Mekanlar, Emre Kutlu tarafından kendi arkadaş çevresiyle
        kullanmak için geliştirilen bağımsız bir yazılım projesidir. Herhangi
        bir şirketi veya ticari işletmeyi temsil etmez. Web sitesi isteyen
        herkesin erişimine açıktır; isteyen katılır, isteyen kullanmayı
        bırakır veya hesabını siler.
      </p>
      <p>
        Uygulamada reklam, sponsorlu sıralama, pazarlama faaliyeti veya
        reklam hedeflemesi yapılmaz; kişisel veriler satılmaz. Katılım tamamen
        isteğe bağlıdır ve kullanıcı hesabını Ayarlar üzerinden silebilir.
      </p>
      <p>
        Kaynak kodu{" "}
        <a
          href="https://github.com/3kutlu/bizim-mekanlar"
          target="_blank"
          rel="noreferrer"
        >
          GitHub üzerinden
        </a>{" "}
        incelenebilir, kendi kopyası oluşturulabilir ve depoda belirtilen
        lisans koşulları kapsamında kullanılabilir. Kaynak kodunun açık olması
        kullanıcı verilerinin, fotoğraflarının veya içeriklerinin açık olduğu
        anlamına gelmez.
      </p>
    </aside>
  );
}

async function getFunctionErrorMessage(error) {
  try {
    const response = error?.context;

    if (response && typeof response.clone === "function") {
      const body = await response.clone().json();
      return String(body?.message ?? "").trim();
    }
  } catch {
    // Edge Function response body may not be JSON.
  }

  return "";
}

function AydinlatmaContent() {
  return (
    <article className="legal-copy">
      <LegalNotice />

      <section>
        <h2>1. Veri sorumlusu</h2>
        <p>
          6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri
          sorumlusu, Bizim Mekanlar’ı geliştiren ve işleten Emre Kutlu’dur.
          Gizlilik, hesap, içerik ve KVKK talepleri için{" "}
          <a href="/iletisim">İletişim sayfasındaki form</a> kullanılabilir.
        </p>
      </section>

      <section>
        <h2>2. İşlenen bilgiler</h2>
        <ul>
          <li>
            Hesap bilgileri: e-posta adresi, kullanıcı adı, ad, isteğe bağlı
            soyadı, doğum tarihi, şehir ve hesap gizliliği tercihi.
          </li>
          <li>
            Kullanıcı içerikleri: profil ve mekân fotoğrafları, notlar,
            puanlar, koleksiyonlar, liste notları, takipler, tepkiler ve
            kullanıcılar arası paylaşımlar.
          </li>
          <li>
            Bildirim bilgileri: Web Push aboneliği, cihazın bildirim durumu ve
            bildirim kategori tercihleri.
          </li>
          <li>
            Teknik ve güvenlik bilgileri: oturum verileri, kayıt kötüye
            kullanımını önlemeye yarayan cihaz tanımlayıcısı, hata kayıtları,
            temel trafik ve performans verileri.
          </li>
          <li>
            İletişim bilgileri: İletişim formuna yazılan e-posta adresi, konu
            ve mesaj.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Neden işleniyor?</h2>
        <ul>
          <li>Hesap oluşturmak, doğrulamak ve güvenli giriş sağlamak.</li>
          <li>
            Doğum tarihinden yaş uygunluğu uyarısını ve burç bilgisini
            hesaplamak.
          </li>
          <li>
            Profil, harita, not, koleksiyon, takip, paylaşım ve bildirim
            özelliklerini çalıştırmak.
          </li>
          <li>
            Sahte veya kötüye kullanılan hesapları azaltmak, güvenliği
            sağlamak ve hataları gidermek.
          </li>
          <li>İletişim, KVKK ve içerik şikâyeti taleplerini yanıtlamak.</li>
        </ul>
        <p>
          Kişisel veriler; kullanıcıyla kurulan hizmet ilişkisinin
          yürütülmesi, hukuki yükümlülükler, temel güvenlik için meşru menfaat
          ve gerekli olduğu durumlarda açık rıza hukuki sebeplerine dayanılarak
          işlenir.
        </p>
      </section>

      <section>
        <h2>4. Hizmet sağlayıcılar ve yurt dışı aktarım</h2>
        <p>
          Uygulamanın çalışması için Supabase (kimlik doğrulama, veritabanı ve
          dosya saklama), Vercel (barındırma, temel trafik ve performans),
          Google Maps/Places (mekân ve harita verileri) ve Brevo (hesap
          e-postaları) hizmetlerinden yararlanılır. Bu sağlayıcıların
          altyapıları nedeniyle veriler Türkiye dışında işlenebilir.
        </p>
        <p>
          Bu aktarım reklam veya pazarlama amacıyla yapılmaz; yalnızca
          uygulamanın teknik olarak çalışması, güvenliği ve hesap
          iletişimlerinin gönderilmesi için gerekli kapsamla sınırlıdır.
        </p>
      </section>

      <section>
        <h2>5. Konum bilgisi</h2>
        <p>
          Cihaz konumu yalnızca kullanıcı izin verdiğinde haritada yakın
          mekânları göstermek için anlık olarak kullanılır. Canlı konum
          geçmişi kullanıcı profiline kaydedilmez. Kullanıcı cihaz veya
          tarayıcı ayarlarından konum iznini geri alabilir.
        </p>
      </section>

      <section>
        <h2>6. Saklama ve hesap silme</h2>
        <p>
          Hesap ve kullanıcı içerikleri hesap açık olduğu sürece saklanır.
          Hesap silme talebinden sonra hesap 7 gün boyunca dondurulur; kullanıcı
          bu sürede hesabını geri açabilir. Süre sonunda hesap, içerikler ve
          fotoğraflar kalıcı silme sürecine alınır. Güvenlik kayıtları,
          yedekler ve hukuki uyuşmazlıklara ilişkin kayıtlar teknik veya yasal
          olarak gerekli olan sınırlı süre boyunca tutulabilir.
        </p>
      </section>

      <section>
        <h2>7. Hakların</h2>
        <p>
          KVKK’nın 11. maddesi kapsamında verilerinin işlenip işlenmediğini
          öğrenme, bilgi talep etme, düzeltme veya silme isteme, aktarım
          yapılan tarafları öğrenme ve kanuna aykırı işleme nedeniyle zararın
          giderilmesini isteme haklarına sahipsin. Talebini{" "}
          <a href="/iletisim">İletişim formundan</a> “KVKK talebi” türünü
          seçerek iletebilirsin.
        </p>
      </section>
    </article>
  );
}

function GizlilikContent() {
  return (
    <article className="legal-copy">
      <LegalNotice />

      <section>
        <h2>Hesap görünürlüğü</h2>
        <p>
          Yeni hesaplar varsayılan olarak gizli oluşturulur. Gizli hesapta
          notlarını, fotoğraflarını ve takip listelerini yalnızca onayladığın
          takipçiler görebilir. Hesabını herkese açık hâle getirmek tamamen
          senin seçimindir; bu durumda profil ve izin verilen içeriklerin diğer
          kayıtlı Bizim Mekanlar kullanıcılarına görünür.
        </p>
        <p>
          Doğrudan bir kullanıcıyla paylaştığın içerikler ve ortak
          koleksiyonlar kendi erişim kurallarına tabidir. Bir içeriği
          paylaşmadan önce hedef kişiyi ve koleksiyon üyelerini kontrol
          etmelisin.
        </p>
      </section>

      <section>
        <h2>Fotoğraflar ve kullanıcı içerikleri</h2>
        <p>
          Fotoğraf eklemek isteğe bağlıdır. Eklediğin fotoğraf ve içeriklerin
          sahibi olmaya devam edersin; Bizim Mekanlar’a yalnızca içeriği
          saklama, teknik olarak işleme ve seçtiğin görünürlük kapsamında
          gösterme yetkisi verirsin.
        </p>
        <p>
          Kaynak kodu herkese açık olsa da veritabanı, e-posta adresleri,
          fotoğraflar ve kullanıcı içerikleri GitHub deposunda yayımlanmaz.
        </p>
      </section>

      <section>
        <h2>Reklam ve pazarlama yok</h2>
        <p>
          Bizim Mekanlar’da reklam, sponsorlu içerik, ücretli mekân sıralaması
          veya pazarlama profillemesi bulunmaz. Kişisel veriler reklam
          hedeflemek için kullanılmaz, reklam verenlerle paylaşılmaz ve
          satılmaz.
        </p>
      </section>

      <section>
        <h2>Güvenlik ve kullanıcı kontrolü</h2>
        <p>
          Hesap erişimi e-posta doğrulamasıyla korunur. Kullanıcılar hesaplarını
          gizleyebilir, diğer hesapları engelleyebilir veya sessize alabilir,
          bildirim izinlerini kapatabilir, hesaplarını dondurabilir ve silme
          talebi oluşturabilir.
        </p>
      </section>
    </article>
  );
}

function KosullarContent() {
  return (
    <article className="legal-copy">
      <LegalNotice />

      <section>
        <h2>1. Katılım ve hesabın</h2>
        <p>
          Bizim Mekanlar’a katılmak isteğe bağlıdır. İsteyen hesap oluşturur,
          istemeyen kullanmaz; kullanıcı hesabını dondurabilir veya silebilir.
          Hesap bilgilerini doğru ve güncel tutmaktan, e-posta hesabının
          güvenliğinden kullanıcı sorumludur.
        </p>
      </section>

      <section>
        <h2>2. Yaş ve alkollü içkiler</h2>
        <p>
          Uygulamada hesap açmak için 18 yaşını doldurmuş olma şartı yoktur.
          Ancak Türkiye’de alkollü içkiler, tüketilmek veya beraberinde
          götürülmek üzere 18 yaşını doldurmamış kişilere satılamaz veya
          sunulamaz.{" "}
          <a
            href="https://www.tarimorman.gov.tr/TADAB/Belgeler/Kanunlar/kanun_4250.pdf"
            target="_blank"
            rel="noreferrer"
          >
            4250 sayılı Kanun
          </a>
        </p>
        <p>
          Bizim Mekanlar alkollü içki satmaz, sunmaz ve tüketimini teşvik
          etmez. 18 yaş altındaki kullanıcılar bar kategorisindeki mekânları
          görebilir ve işletmenin yemek, ortam, servis veya genel mekân
          deneyimi hakkında not paylaşabilir. Bu erişim, yaşa ilişkin yasal
          satış ve sunum kurallarını değiştirmez; işletmeler kendi yasal yaş
          kontrolü yükümlülüklerinden sorumludur.
        </p>
      </section>

      <section>
        <h2>3. Kullanıcı içerikleri</h2>
        <p>
          Paylaştığın not, fotoğraf ve diğer içeriklerden sen sorumlusun.
          Başkasının telif, kişilik veya gizlilik haklarını ihlal eden;
          hukuka aykırı, tehdit edici, taciz edici, nefret söylemi içeren ya da
          yanıltıcı içerikler paylaşamazsın.
        </p>
        <p>
          Şikâyet edilen veya bu koşullara aykırı olduğu değerlendirilen içerik
          kaldırılabilir; ilgili hesap geçici olarak dondurulabilir ya da
          kapatılabilir.
        </p>
      </section>

      <section>
        <h2>4. Mekân bilgileri ve yorumlar</h2>
        <p>
          Mekân adı, adresi, kategorisi ve harita bilgileri Google Maps/Places
          gibi üçüncü taraf kaynaklardan gelebilir ve zaman zaman eksik veya
          güncel olmayabilir. Kullanıcı notları kişisel deneyimleri yansıtır;
          Bizim Mekanlar tarafından verilmiş profesyonel tavsiye veya garanti
          değildir.
        </p>
      </section>

      <section>
        <h2>5. Hizmetin niteliği</h2>
        <p>
          Bu uygulama ücretsiz, ticari olmayan ve aktif olarak geliştirilen
          kişisel bir projedir. Hizmetin kesintisiz veya hatasız olacağı
          garanti edilmez. Bakım, güvenlik, maliyet veya teknik zorunluluk
          nedeniyle özellikler değiştirilebilir ya da hizmet sona erdirilebilir.
        </p>
      </section>

      <section>
        <h2>6. Kaynak kodu</h2>
        <p>
          Kaynak kodu GitHub’da yayımlanır. Kodun incelenmesi, kopyalanması,
          değiştirilmesi ve dağıtılması depoda belirtilen lisans koşullarına
          tabidir. Kullanıcı içerikleri ve kişisel veriler kaynak kodu
          lisansının parçası değildir.
        </p>
      </section>

      <section>
        <h2>7. Değişiklikler</h2>
        <p>
          Koşullarda önemli bir değişiklik yapılırsa yürürlük tarihi
          güncellenir ve uygulama içinde uygun bir bildirim gösterilir.
        </p>
      </section>
    </article>
  );
}

function DepolamaContent() {
  return (
    <article className="legal-copy">
      <section>
        <h2>Zorunlu tarayıcı depolaması</h2>
        <p>
          Supabase oturum bilgileri, giriş yaptığını hatırlamak ve hesabını
          güvenli biçimde açık tutmak için tarayıcının yerel depolamasında
          saklanır. Kayıt kötüye kullanımını azaltan cihaz tanımlayıcısı ile
          onboarding, arayüz ve bildirim istemi tercihleri de cihazında
          tutulabilir.
        </p>
      </section>

      <section>
        <h2>Web Push</h2>
        <p>
          Web Push yalnızca sen açarsan kullanılır. Bildirim aboneliğini
          tarayıcı veya uygulama ayarlarından kapatabilir, kategori
          tercihlerini Bizim Mekanlar içindeki Bildirim Ayarları’ndan
          değiştirebilirsin.
        </p>
      </section>

      <section>
        <h2>Analiz ve performans</h2>
        <p>
          Vercel Analytics ve Speed Insights, uygulamadaki temel trafik ve
          performans sorunlarını anlamak için kullanılır. Bu veriler reklam,
          pazarlama veya kullanıcıları ticari olarak profilleme amacıyla
          kullanılmaz.
        </p>
      </section>

      <section>
        <h2>Pazarlama çerezi yok</h2>
        <p>
          Reklam, yeniden hedefleme veya pazarlama çerezi kullanılmaz. Bu
          nedenle yalnızca “tüm çerezleri kabul et” seçeneği sunan bir reklam
          çerezi bannerı gösterilmez. Tarayıcı verilerini temizlersen oturumun
          kapanabilir ve cihaz tercihlerin sıfırlanabilir.
        </p>
      </section>
    </article>
  );
}

export function LegalPage({ hasSession = false }) {
  const [activeTab, setActiveTab] = useState(getInitialLegalTab);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (window.location.pathname !== "/aydinlatma") {
      window.history.replaceState(
        window.history.state,
        "",
        `/aydinlatma${window.location.hash || ""}`
      );
    }

    const handleHashChange = () => setActiveTab(getInitialLegalTab());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const activeContent = useMemo(() => {
    if (activeTab === "gizlilik") return <GizlilikContent />;
    if (activeTab === "kosullar") return <KosullarContent />;
    if (activeTab === "depolama") return <DepolamaContent />;
    return <AydinlatmaContent />;
  }, [activeTab]);

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    window.history.replaceState(
      window.history.state,
      "",
      `/aydinlatma#${tabId}`
    );
    document.querySelector(".legal-content")?.scrollTo({ top: 0 });
  };

  return (
    <LegalShell
      title="Yasal ve Gizlilik"
      description="Hangi bilgilerin neden kullanıldığını, hesabının görünürlüğünü ve kullanım kurallarını açıkça görebilirsin."
      hasSession={hasSession}
    >
      <nav className="legal-tabs" aria-label="Yasal metin bölümleri">
        {LEGAL_TABS.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "legal-tab-active" : ""}
            type="button"
            aria-current={activeTab === tab.id ? "page" : undefined}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="legal-content">
        {activeContent}
        <footer className="legal-footer">
          <span>Yürürlük tarihi: 26 Temmuz 2026</span>
          <span>Sürüm: {LEGAL_VERSION}</span>
          <a href="/iletisim">İletişim ve KVKK talebi</a>
        </footer>
      </div>
    </LegalShell>
  );
}

export function TermsAcceptanceGate({
  profileUsername = "",
  onAccepted,
  onLogout,
}) {
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleteUsername, setDeleteUsername] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState("");
  const normalizedProfileUsername = String(profileUsername).trim().toLowerCase();
  const deleteUsernameMatches =
    normalizedProfileUsername.length > 0 &&
    deleteUsername.trim().toLowerCase() === normalizedProfileUsername;

  const acceptTerms = async (event) => {
    event.preventDefault();

    if (submitting) {
      return;
    }

    if (!accepted) {
      setFeedback("Devam etmek için Kullanım Koşulları’nı kabul etmelisin.");
      return;
    }

    setSubmitting(true);
    setFeedback("");

    const { error } = await supabase.rpc("AcceptMyTerms", {
      p_terms_version: LEGAL_VERSION,
    });

    if (error) {
      console.error("Kullanım koşulları onayı kaydedilemedi:", error);
      setFeedback(
        "Onayın şu an kaydedilemedi. İnternet bağlantını kontrol edip tekrar dene."
      );
      setSubmitting(false);
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(TERMS_ACCEPTED_EVENT, {
          detail: { termsVersion: LEGAL_VERSION },
        })
      );
    }

    onAccepted?.(LEGAL_VERSION);
  };

  const requestAccountDeletion = async () => {
    if (deleteSubmitting || !deleteUsernameMatches) {
      return;
    }

    setDeleteSubmitting(true);
    setDeleteFeedback("");

    const { error } = await supabase.functions.invoke("manage-account", {
      body: {
        action: "request-deletion",
        username: deleteUsername.trim().toLowerCase(),
      },
    });

    if (error) {
      const responseMessage = await getFunctionErrorMessage(error);
      console.error("Hesap silme talebi oluşturulamadı:", error);
      setDeleteFeedback(
        responseMessage ||
          error?.message ||
          "Hesap silme talebi şu an oluşturulamadı. Tekrar dene."
      );
      setDeleteSubmitting(false);
      return;
    }

    const logoutSucceeded = await onLogout?.();

    if (logoutSucceeded === false) {
      setDeleteFeedback(
        "Silme talebin oluşturuldu ancak oturum kapatılamadı. Sayfayı yenileyip tekrar çıkış yapabilirsin."
      );
      setDeleteSubmitting(false);
    }
  };

  return (
    <main className="legal-page legal-consent-page">
      <section className="legal-consent-card" aria-labelledby="terms-consent-title">
        <p className="legal-brand">BİZİM MEKANLAR</p>
        <span className="legal-consent-kicker">Bir kerelik onay</span>
        <h1 id="terms-consent-title">Devam etmeden önce</h1>
        <p className="legal-consent-intro">
          Bizim Mekanlar’ı kullanmaya devam etmek için güncel Kullanım
          Koşulları’nı inceleyip kabul etmen gerekiyor. Kabulün hesabına bir
          kez kaydedilecek; aynı sürüm için bu ekranı tekrar görmeyeceksin.
        </p>

        <aside className="legal-consent-notice">
          <strong>Reklam veya pazarlama izni değil</strong>
          <p>
            Uygulamada reklam ve pazarlama yapılmaz. Bu onay yalnızca uygulamanın
            kullanım kuralları içindir.
          </p>
        </aside>

        <form className="legal-consent-form" onSubmit={acceptTerms}>
          <label className="legal-consent-checkbox">
            <input
              type="checkbox"
              checked={accepted}
              required
              disabled={submitting}
              onChange={(event) => {
                setAccepted(event.target.checked);
                setFeedback("");
              }}
            />
            <span>
              <strong>
                <a
                  href="/aydinlatma#kosullar"
                  target="_blank"
                  rel="noreferrer"
                >
                  Kullanım Koşulları’nı
                </a>{" "}
                okudum ve kabul ediyorum.
              </strong>
              <small>
                Aydınlatma ve gizlilik metinleri aynı sayfada yer alır.
              </small>
            </span>
          </label>

          {feedback && (
            <p className="contact-feedback" role="alert">
              {feedback}
            </p>
          )}

          <button
            className="legal-consent-submit"
            type="submit"
            disabled={submitting || !accepted}
          >
            {submitting ? "Kaydediliyor..." : "Kabul et ve devam et"}
          </button>

          <button
            className="legal-consent-logout"
            type="button"
            disabled={submitting || deleteSubmitting}
            onClick={onLogout}
          >
            Hesaptan çık
          </button>
        </form>

        <div className="legal-consent-delete-area">
          <button
            className="legal-consent-delete-toggle"
            type="button"
            disabled={submitting || deleteSubmitting}
            aria-expanded={deleteConfirmationOpen}
            onClick={() => {
              setDeleteConfirmationOpen((current) => !current);
              setDeleteUsername("");
              setDeleteFeedback("");
            }}
          >
            Hesabımı sil
          </button>

          {deleteConfirmationOpen && (
            <section
              className="legal-consent-delete-confirmation"
              aria-labelledby="terms-account-delete-title"
            >
              <strong id="terms-account-delete-title">
                Hesabını silmek istediğine emin misin?
              </strong>
              <p>
                Hesabın önce 7 gün süreyle dondurulur. Bu sürede tekrar giriş
                yaparak hesabını geri açabilirsin. Süre sonunda hesabın,
                içeriklerin ve fotoğrafların kalıcı olarak silinir.
              </p>

              <label>
                Devam etmek için <strong>{normalizedProfileUsername}</strong>{" "}
                yaz:
                <input
                  type="text"
                  value={deleteUsername}
                  disabled={deleteSubmitting}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  onChange={(event) => {
                    setDeleteUsername(event.target.value);
                    setDeleteFeedback("");
                  }}
                />
              </label>

              {deleteFeedback && (
                <p className="contact-feedback" role="alert">
                  {deleteFeedback}
                </p>
              )}

              <div className="legal-consent-delete-actions">
                <button
                  type="button"
                  disabled={deleteSubmitting}
                  onClick={() => {
                    setDeleteConfirmationOpen(false);
                    setDeleteUsername("");
                    setDeleteFeedback("");
                  }}
                >
                  Vazgeç
                </button>
                <button
                  className="legal-consent-delete-submit"
                  type="button"
                  disabled={deleteSubmitting || !deleteUsernameMatches}
                  onClick={() => void requestAccountDeletion()}
                >
                  {deleteSubmitting ? "İşleniyor..." : "Hesabımı sil"}
                </button>
              </div>
            </section>
          )}
        </div>

        <p className="legal-consent-version">
          Kullanım Koşulları sürümü: {LEGAL_VERSION}
        </p>
      </section>
    </main>
  );
}

function createContactDeviceToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getContactDeviceToken() {
  const fallbackToken = createContactDeviceToken();

  if (typeof window === "undefined") {
    return fallbackToken;
  }

  try {
    const current = window.localStorage.getItem(CONTACT_DEVICE_STORAGE_KEY);
    if (current && current.length >= 16) return current;

    window.localStorage.setItem(CONTACT_DEVICE_STORAGE_KEY, fallbackToken);
    return fallbackToken;
  } catch {
    return fallbackToken;
  }
}

export function ContactPage({ hasSession = false, defaultEmail = "" }) {
  const [requestType, setRequestType] = useState("GENERAL");
  const [email, setEmail] = useState(defaultEmail);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!defaultEmail) return;
    setEmail((currentEmail) => currentEmail || defaultEmail);
  }, [defaultEmail]);

  const submitContact = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (website) {
      setIsSuccess(true);
      setFeedback("Mesajın alındı.");
      return;
    }

    setSubmitting(true);
    setFeedback("");
    setIsSuccess(false);

    const { error } = await supabase.rpc("CreateContactRequest", {
      p_email: email.trim().toLowerCase(),
      p_request_type: requestType,
      p_subject: subject.trim(),
      p_message: message.trim(),
      p_device_token: getContactDeviceToken(),
    });

    if (error) {
      console.error("İletişim talebi kaydedilemedi:", error);
      const isRateLimited = String(error.message ?? "").includes(
        "CONTACT_RATE_LIMIT"
      );
      setFeedback(
        isRateLimited
          ? "Kısa sürede çok fazla mesaj gönderdin. Biraz sonra tekrar dene."
          : "Mesaj şu an gönderilemedi. Lütfen biraz sonra tekrar dene."
      );
    } else {
      setIsSuccess(true);
      setFeedback("Mesajın kaydedildi. Gerekirse verdiğin e-posta üzerinden dönüş yapılacak.");
      setSubject("");
      setMessage("");
    }

    setSubmitting(false);
  };

  return (
    <LegalShell
      title="İletişim"
      description="Hata, öneri, içerik şikâyeti veya KVKK talebini buradan iletebilirsin."
      hasSession={hasSession}
    >
      <div className="legal-content contact-content">
        <LegalNotice />

        <form className="contact-form" onSubmit={submitContact}>
          <label>
            Talep türü
            <select
              value={requestType}
              disabled={submitting}
              onChange={(event) => setRequestType(event.target.value)}
            >
              <option value="GENERAL">Genel mesaj / öneri</option>
              <option value="BUG">Hata bildirimi</option>
              <option value="CONTENT">İçerik şikâyeti</option>
              <option value="KVKK">KVKK talebi</option>
              <option value="SECURITY">Güvenlik bildirimi</option>
            </select>
          </label>

          <label>
            E-posta
            <input
              type="email"
              value={email}
              maxLength="320"
              autoComplete="email"
              required
              disabled={submitting}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            Konu
            <input
              type="text"
              value={subject}
              minLength="3"
              maxLength="120"
              required
              disabled={submitting}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>

          <label>
            Mesaj
            <textarea
              value={message}
              minLength="10"
              maxLength="2000"
              rows="7"
              required
              disabled={submitting}
              onChange={(event) => setMessage(event.target.value)}
            />
            <small>{message.length}/2000</small>
          </label>

          <label className="contact-honeypot" aria-hidden="true">
            Website
            <input
              type="text"
              value={website}
              tabIndex="-1"
              autoComplete="off"
              onChange={(event) => setWebsite(event.target.value)}
            />
          </label>

          <p className="contact-privacy-note">
            Formdaki bilgiler yalnızca talebini değerlendirmek ve gerektiğinde
            sana dönüş yapmak için kullanılır. Ayrıntılar için{" "}
            <a href="/aydinlatma#aydinlatma">Aydınlatma Metni’ni</a>{" "}
            inceleyebilirsin.
          </p>

          <button type="submit" disabled={submitting}>
            {submitting ? "Gönderiliyor..." : "Mesajı gönder"}
          </button>

          {feedback && (
            <p
              className={`contact-feedback${
                isSuccess ? " contact-feedback-success" : ""
              }`}
              role="status"
            >
              {feedback}
            </p>
          )}
        </form>
      </div>
    </LegalShell>
  );
}

export { LEGAL_VERSION, TERMS_ACCEPTED_EVENT };
