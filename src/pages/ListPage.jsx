import "../css/list-page.css";

function ListPage() {
  return (
    <section className="page-section">
      <div className="page-heading">
        <p className="eyebrow">GÜNLÜK</p>
        <h1>Mekanların</h1>
        <p>Kaydettiğiniz mekanlar, ziyaretler ve notlar burada listelenecek.</p>
      </div>

      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">✦</div>
        <h2>Henüz mekan yok</h2>
        <p>İlk mekanı eklediğinizde burada görünmeye başlayacak.</p>
      </div>
    </section>
  );
}

export default ListPage;
