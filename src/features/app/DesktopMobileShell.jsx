function DesktopInstallPanel() {
  return (
    <aside className="desktop-install-panel" aria-label="Mobil kullanım önerisi">
      <div className="desktop-install-card">
        <p className="eyebrow">MOBİL DENEYİM</p>
        <h2>Bizim Mekanlar telefon için tasarlandı.</h2>
        <p>
          En iyi deneyim için uygulamayı telefonda açıp ana ekrana ekleyebilirsin.
        </p>

        <div className="desktop-install-steps" aria-label="Ana ekrana ekleme adımları">
          <div>
            <strong>iPhone</strong>
            <span>Safari → Paylaş → Ana Ekrana Ekle</span>
          </div>
          <div>
            <strong>Android</strong>
            <span>Chrome → Menü → Ana ekrana ekle</span>
          </div>
        </div>
      </div>

      <div className="desktop-feedback-panel" aria-label="Geri bildirim notu">
        <p>
          Bizim Mekanlar henüz gelişmeye devam ediyor. Her türlü hata, öneri ya da fikir için{" "}
          <a href="mailto:3kutlu@gmail.com?subject=Bizim%20Mekanlar%20Geri%20Bildirim">
            bizimle iletişime geçebilirsiniz.
          </a>
        </p>
      </div>
    </aside>
  );
}

export default function DesktopMobileShell({ children }) {
  return (
    <div className="desktop-mobile-shell">
      <DesktopInstallPanel />
      {children}
    </div>
  );
}
