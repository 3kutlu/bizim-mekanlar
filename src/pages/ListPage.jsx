import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import "../css/list-page.css";

function formatFeedTime(value) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();

  if (!Number.isFinite(diff)) {
    return "";
  }

  if (diff < 60_000) {
    return "şimdi";
  }

  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)} dk`;
  }

  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)} sa`;
  }

  if (diff < 7 * 86_400_000) {
    return `${Math.floor(diff / 86_400_000)} gün`;
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFullDate(value) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getPlace(entry) {
  if (Array.isArray(entry.places)) {
    return entry.places[0] || null;
  }

  return entry.places || null;
}

function ListPage({ username = "Kullanıcı" }) {
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const { data, error } = await supabase
        .from("place_notes")
        .select(`
          id,
          note,
          created_at,
          places (
            id,
            name,
            address,
            google_place_id
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setNotes(data || []);
    } catch (error) {
      console.error("Notlar yüklenirken hata oluştu:", error);
      setLoadError("Notların yüklenemedi. Tekrar dene.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  return (
    <section className="list-page page-section">
      <div className="page-heading list-page-heading">
        <p className="eyebrow">GÜNLÜK</p>
        <h1>Yorumların</h1>
        <p>Kaydettiğin mekanlara bıraktığın notlar.</p>
      </div>

      {isLoading && (
        <div className="list-state">
          <span className="list-loading-dot" />
          Notların yükleniyor...
        </div>
      )}

      {!isLoading && loadError && (
        <div className="list-state list-state-error">
          <p>{loadError}</p>

          <button type="button" onClick={loadNotes}>
            Tekrar dene
          </button>
        </div>
      )}

      {!isLoading && !loadError && notes.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✦</div>
          <h2>Henüz yorum yok</h2>
          <p>
            Haritadan bir mekan seçip ilk notunu eklediğinde burada
            görünmeye başlayacak.
          </p>
        </div>
      )}

      {!isLoading && !loadError && notes.length > 0 && (
        <div className="note-feed">
          {notes.map((entry) => {
            const place = getPlace(entry);

            return (
              <article key={entry.id} className="note-feed-card">
                {note.UserId && onOpenUser ? (
                  <button
                    className="note-feed-avatar note-feed-avatar-button"
                    type="button"
                    onClick={() => onOpenUser(note.UserId)}
                    title="Kullanıcı profilini aç"
                    aria-label={`${username} profilini aç`}
                  >
                    <span aria-hidden="true">
                      {username.charAt(0).toUpperCase()}
                    </span>
                  </button>
                ) : (
                  <div className="note-feed-avatar" aria-hidden="true">
                    {username.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="note-feed-content">
                  <header className="note-feed-header">
                    <div className="note-feed-meta">
                      <strong>{username}</strong>
                      <span>bir mekana not ekledi</span>
                    </div>

                    <time
                      dateTime={entry.created_at}
                      title={formatFullDate(entry.created_at)}
                    >
                      {formatFeedTime(entry.created_at)}
                    </time>
                  </header>

                  <div className="note-feed-place">
                    <strong>{place?.name || "İsimsiz mekan"}</strong>

                    {place?.address && (
                      <span>{place.address}</span>
                    )}
                  </div>

                  <p className="note-feed-text">{entry.note}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ListPage;