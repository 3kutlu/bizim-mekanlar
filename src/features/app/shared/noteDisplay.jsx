import AppIcon from "../../../components/AppIcon.jsx";

export function getNoteTitle(note) {
  return String(note?.Title ?? "").trim() || "Başlıksız not";
}

export function formatNoteRating(value) {
  const rating = Number(value);

  return Number.isInteger(rating) && rating >= 1 && rating <= 5
    ? `${rating} / 5`
    : "Puanlanmadı";
}

export function ReadOnlyRatingStars({ value }) {
  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return <span className="note-detail-rating-empty">Puanlanmadı</span>;
  }

  return (
    <span
      className="note-detail-stars"
      role="img"
      aria-label={`${rating} üzerinden 5 yıldız`}
      title={`${rating} / 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={
            star <= rating
              ? "note-detail-star note-detail-star-active"
              : "note-detail-star"
          }
          aria-hidden="true"
        >
          <AppIcon name={star <= rating ? "star-fill" : "star"} />
        </span>
      ))}
    </span>
  );
}
