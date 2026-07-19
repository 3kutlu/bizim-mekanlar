function SkeletonLine({ width, className = "" }) {
  return (
    <span
      className={`page-skeleton-block${className ? ` ${className}` : ""}`}
      style={width ? { width } : undefined}
      aria-hidden="true"
    />
  );
}

export function FeedPageSkeleton({ compact = false }) {
  return (
    <div
      className={`page-skeleton page-skeleton-feed${compact ? " page-skeleton-compact" : ""}`}
      role="status"
      aria-label="Akış yükleniyor"
      aria-busy="true"
    >
      {!compact && (
        <div className="page-skeleton-heading" aria-hidden="true">
          <SkeletonLine width="34%" className="page-skeleton-title" />
          <SkeletonLine width="72%" />
        </div>
      )}

      <div className="page-skeleton-feed-list" aria-hidden="true">
        {Array.from({ length: compact ? 3 : 6 }, (_, index) => (
          <div className="page-skeleton-feed-card" key={index}>
            <SkeletonLine className="page-skeleton-avatar" />
            <div className="page-skeleton-feed-copy">
              <SkeletonLine width={`${62 + (index % 3) * 8}%`} />
              <SkeletonLine width="44%" />
              <SkeletonLine width="28%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfilePageSkeleton() {
  return (
    <div
      className="page-skeleton page-skeleton-profile"
      role="status"
      aria-label="Profil yükleniyor"
      aria-busy="true"
    >
      <div className="page-skeleton-profile-head" aria-hidden="true">
        <SkeletonLine className="page-skeleton-profile-avatar" />
        <div className="page-skeleton-profile-identity">
          <SkeletonLine width="58%" className="page-skeleton-title" />
          <SkeletonLine width="78%" />
          <SkeletonLine width="48%" />
        </div>
      </div>

      <div className="page-skeleton-profile-tabs" aria-hidden="true">
        <SkeletonLine />
        <SkeletonLine />
        <SkeletonLine />
      </div>

      <FeedPageSkeleton compact />
    </div>
  );
}

export function ProfileTabSkeleton({ variant = "photos" }) {
  const itemCount = variant === "lists" ? 4 : 9;

  return (
    <div
      className={`page-skeleton-profile-grid page-skeleton-profile-grid-${variant}`}
      role="status"
      aria-label={variant === "lists" ? "Listeler yükleniyor" : "Fotoğraflar yükleniyor"}
      aria-busy="true"
    >
      {Array.from({ length: itemCount }, (_, index) => (
        <SkeletonLine key={index} />
      ))}
    </div>
  );
}
