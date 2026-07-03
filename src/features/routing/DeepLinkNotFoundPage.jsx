import "../../css/deep-links.css";

export default function DeepLinkNotFoundPage({ path }) {
  return (
    <div className="discovery-page-content deep-link-not-found-page">
      <div className="deep-link-not-found-card" role="status">
        <span className="deep-link-not-found-icon" aria-hidden="true">
          ?
        </span>
        <p className="eyebrow">BAĞLANTI</p>
        <h1>Bu sayfa bulunamadı</h1>
        <p>
          Bağlantı geçersiz olabilir veya içerik artık erişime açık değildir.
        </p>
        {path && <code>{path}</code>}
      </div>
    </div>
  );
}
