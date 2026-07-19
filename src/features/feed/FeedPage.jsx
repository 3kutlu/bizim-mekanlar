import { useCallback, useEffect, useRef, useState } from "react";
import AppIcon from "../../components/AppIcon.jsx";
import { MESSAGE_KEY } from "../../i18n/messages.js";
import { supabase } from "../../supabase.js";
import { filterUnavailableUsers, getMyUnavailableUserIds } from "../../utils/userRelationships.js";
import { getVenueCategoryIcon, getVenueCategoryLabel } from "../../utils/venueCategory.js";
import { FeedPageSkeleton } from "../app/shared/pageSkeletons.jsx";
import { EmptyCollectionState, ErrorState, NoteFeed } from "../notes/NoteComponents.jsx";

const FEED_PAGE_SIZE = 20;
const FEED_TAB_STORAGE_KEY = "bizim-mekanlar.feed-tab";

const FEED_TABS = Object.freeze({
  following: {
    label: "Takip Ettiklerin",
    rpcName: "GetFollowingFeedNoteCardsPageV1",
    errorMessage: MESSAGE_KEY.FEED_LOAD_FAILED,
  },
  discover: {
    label: "Keşfet",
    rpcName: "GetDiscoverFeedNoteCardsPageV1",
    errorMessage: "Keşfet akışı şu an yüklenemedi. Tekrar dene.",
  },
});

function getInitialFeedTab() {
  if (typeof window === "undefined") {
    return "following";
  }

  try {
    const savedTab = window.sessionStorage.getItem(FEED_TAB_STORAGE_KEY);
    return savedTab === "discover" ? "discover" : "following";
  } catch {
    return "following";
  }
}

function createInitialFeedState() {
  return {
    notes: [],
    loading: false,
    loadingMore: false,
    loaded: false,
    hasMore: true,
    errorMessage: "",
  };
}

function mergeUniqueNotes(currentNotes, nextNotes) {
  const seenNoteIds = new Set();

  return [...currentNotes, ...nextNotes].filter((note) => {
    const noteId = Number(note?.PlaceNoteId);

    if (!Number.isInteger(noteId) || noteId <= 0) {
      return true;
    }

    if (seenNoteIds.has(noteId)) {
      return false;
    }

    seenNoteIds.add(noteId);
    return true;
  });
}

function usePaginatedFeed({ enabled, refreshKey, rpcName, errorMessage }) {
  const [state, setState] = useState(createInitialFeedState);
  const stateRef = useRef(state);
  const requestIdRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    requestIdRef.current += 1;
    setState(createInitialFeedState());
  }, [refreshKey, rpcName]);

  const loadPage = useCallback(async ({ append = false } = {}) => {
    const snapshot = stateRef.current;

    if (
      snapshot.loading ||
      snapshot.loadingMore ||
      (append && !snapshot.hasMore)
    ) {
      return;
    }

    const cursorNote = append ? snapshot.notes.at(-1) : null;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setState((current) => ({
      ...current,
      loading: !append,
      loadingMore: append,
      errorMessage: "",
    }));

    const { data, error } = await supabase.rpc(rpcName, {
      p_limit: FEED_PAGE_SIZE + 1,
      p_cursor_created_date: cursorNote?.CreatedDate || null,
      p_cursor_place_note_id: Number(cursorNote?.PlaceNoteId) || null,
    });

    if (requestIdRef.current !== requestId) {
      return;
    }

    if (error) {
      console.error(`${rpcName} çağrısı başarısız:`, error);
      setState((current) => ({
        ...current,
        loading: false,
        loadingMore: false,
        loaded: true,
        errorMessage,
      }));
      return;
    }

    const rawRows = Array.isArray(data) ? data : [];
    let visibleRows = rawRows.slice(0, FEED_PAGE_SIZE);

    try {
      const unavailableUserIds = await getMyUnavailableUserIds();

      if (requestIdRef.current !== requestId) {
        return;
      }

      visibleRows = filterUnavailableUsers(
        visibleRows,
        unavailableUserIds,
        ["UserId"]
      );
    } catch (relationshipError) {
      console.error("Akış ilişki filtresi uygulanamadı:", relationshipError);
    }

    setState((current) => ({
      ...current,
      notes: append
        ? mergeUniqueNotes(current.notes, visibleRows)
        : visibleRows,
      loading: false,
      loadingMore: false,
      loaded: true,
      hasMore: rawRows.length > FEED_PAGE_SIZE,
      errorMessage: "",
    }));
  }, [errorMessage, rpcName]);

  useEffect(() => {
    if (enabled && !state.loaded && !state.loading) {
      void loadPage();
    }
  }, [enabled, loadPage, state.loaded, state.loading]);

  const retry = useCallback(() => {
    void loadPage();
  }, [loadPage]);

  const loadMore = useCallback(() => {
    void loadPage({ append: true });
  }, [loadPage]);

  return { ...state, retry, loadMore };
}

function FeedEmptyState({ activeTab, onOpenDiscover }) {
  const isFollowingTab = activeTab === "following";

  return (
    <div className="list-state feed-empty-state">
      <span className="feed-empty-state-icon" aria-hidden="true">
        <AppIcon name={isFollowingTab ? "user-circle-plus" : "magnifying-glass"} />
      </span>
      <h2>
        {isFollowingTab
          ? "Takip ettiklerinin notları burada görünür"
          : "Keşfette henüz not yok"}
      </h2>
      <p>
        {isFollowingTab
          ? "Henüz kimseyi takip etmiyorsan veya takip ettiklerin not paylaşmadıysa public hesapların notlarını keşfedebilirsin."
          : "Public hesaplar yeni mekan notları paylaştıkça burada görünecek."}
      </p>
      {isFollowingTab && (
        <button
          className="feed-empty-state-action"
          type="button"
          onClick={onOpenDiscover}
        >
          Keşfete geç
          <AppIcon name="arrow-right" />
        </button>
      )}
    </div>
  );
}

function TabbedFeed({
  isActive,
  refreshKey,
  currentUserId,
  onOpenPlace,
  onOpenUser,
  onOpenNote,
}) {
  const [activeTab, setActiveTab] = useState(getInitialFeedTab);
  const followingFeed = usePaginatedFeed({
    enabled: isActive && activeTab === "following",
    refreshKey,
    ...FEED_TABS.following,
  });
  const discoverFeed = usePaginatedFeed({
    enabled: isActive && activeTab === "discover",
    refreshKey,
    ...FEED_TABS.discover,
  });
  const activeFeed = activeTab === "discover" ? discoverFeed : followingFeed;

  const selectTab = (nextTab) => {
    setActiveTab(nextTab);

    try {
      window.sessionStorage.setItem(FEED_TAB_STORAGE_KEY, nextTab);
    } catch {
      // Akış tercihi saklanamasa da sekme normal çalışmaya devam eder.
    }
  };

  return (
    <>
      <div className="feed-tabs" role="tablist" aria-label="Akış türü">
        {Object.entries(FEED_TABS).map(([tabId, tab]) => {
          const isSelected = tabId === activeTab;

          return (
            <button
              id={`feed-tab-${tabId}`}
              className={`feed-tab${isSelected ? " feed-tab-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`feed-panel-${tabId}`}
              tabIndex={isSelected ? 0 : -1}
              key={tabId}
              onClick={() => selectTab(tabId)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={`feed-panel-${activeTab}`}
        className="feed-tab-panel"
        role="tabpanel"
        aria-labelledby={`feed-tab-${activeTab}`}
      >
        {(!activeFeed.loaded || activeFeed.loading) && (
          <FeedPageSkeleton compact />
        )}

        {activeFeed.loaded && !activeFeed.loading && activeFeed.errorMessage && (
          <ErrorState
            message={activeFeed.errorMessage}
            onRetry={activeFeed.retry}
          />
        )}

        {activeFeed.loaded &&
          !activeFeed.loading &&
          !activeFeed.errorMessage &&
          activeFeed.notes.length === 0 && (
            <FeedEmptyState
              activeTab={activeTab}
              onOpenDiscover={() => selectTab("discover")}
            />
          )}

        {activeFeed.loaded &&
          !activeFeed.loading &&
          !activeFeed.errorMessage &&
          activeFeed.notes.length > 0 && (
            <>
              <NoteFeed
                notes={activeFeed.notes}
                currentUserId={currentUserId}
                onOpenPlace={onOpenPlace}
                onOpenUser={onOpenUser}
                onOpenNote={onOpenNote}
              />

              {activeFeed.hasMore && (
                <button
                  className="feed-load-more-button"
                  type="button"
                  onClick={activeFeed.loadMore}
                  disabled={activeFeed.loadingMore}
                >
                  {activeFeed.loadingMore ? (
                    <>
                      <AppIcon name="circle-notch" className="feed-load-more-spinner" />
                      Yükleniyor...
                    </>
                  ) : (
                    "Daha fazla göster"
                  )}
                </button>
              )}
            </>
          )}
      </div>
    </>
  );
}

function PlaceReviewFeed({
  isActive,
  loadKey,
  placeId,
  currentUserId,
  onOpenPlace,
  onOpenUser,
  onOpenNote,
}) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const lastLoadKeyRef = useRef("");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("GetPlaceVisibleNoteCards", {
      p_place_id: Number(placeId),
    });

    if (error) {
      console.error("Mekan yorumları alınamadı:", error);
      setNotes([]);
      setErrorMessage(MESSAGE_KEY.PLACE_REVIEWS_LOAD_FAILED);
      setLoading(false);
      return;
    }

    try {
      const unavailableUserIds = await getMyUnavailableUserIds();
      setNotes(filterUnavailableUsers(data ?? [], unavailableUserIds, ["UserId"]));
    } catch (relationshipError) {
      console.error("Akış ilişki filtresi uygulanamadı:", relationshipError);
      setNotes(data ?? []);
    }

    setLoading(false);
  }, [placeId]);

  useEffect(() => {
    if (!isActive || lastLoadKeyRef.current === loadKey) {
      return;
    }

    lastLoadKeyRef.current = loadKey;
    void loadNotes();
  }, [isActive, loadKey, loadNotes]);

  if (loading) {
    return <FeedPageSkeleton compact />;
  }

  if (errorMessage) {
    return <ErrorState message={errorMessage} onRetry={loadNotes} />;
  }

  if (notes.length === 0) {
    return (
      <EmptyCollectionState
        icon="star"
        title="Bu mekanda sana görünür yorum yok"
        message="Bu mekan için ilk görünür notu sen ekleyebilir veya takip ettiğin kişilerin yorumlarını burada görebilirsin."
      />
    );
  }

  return (
    <NoteFeed
      notes={notes}
      currentUserId={currentUserId}
      onOpenPlace={onOpenPlace}
      onOpenUser={onOpenUser}
      onOpenNote={onOpenNote}
    />
  );
}

export function ListPage({
  isActive,
  refreshKey,
  placeReviewFilter,
  onClearPlaceReviewFilter,
  currentUserId,
  onOpenPlace,
  onOpenUser,
  onOpenNote,
}) {
  const isPlaceReviewMode = Boolean(placeReviewFilter?.placeId);
  const venueIcon = getVenueCategoryIcon(placeReviewFilter?.venueCategoryCode);
  const placeReviewLoadKey = `place:${Number(placeReviewFilter?.placeId) || 0}:${placeReviewFilter?.requestId ?? ""}:${refreshKey}`;

  const headingTitle = isPlaceReviewMode
    ? `${placeReviewFilter.placeName} yorumları`
    : "Akış";
  const headingDescription = isPlaceReviewMode
    ? "Kendi notların, herkese açık hesaplar ve seni kabul eden gizli hesapların yorumları burada."
    : "Takip ettiklerinin notlarına göz at veya yeni mekanları keşfet.";

  return (
    <section className="list-page page-section">
      <div className="page-heading list-page-heading">
        {isPlaceReviewMode && <p className="eyebrow">MEKAN YORUMLARI</p>}
        <h1 className={isPlaceReviewMode ? "place-review-list-title" : undefined}>
          {isPlaceReviewMode && (
            <span
              className="venue-category-icon venue-category-icon-page-title"
              title={getVenueCategoryLabel(placeReviewFilter?.venueCategoryCode)}
              aria-hidden="true"
            >
              {venueIcon}
            </span>
          )}
          {headingTitle}
        </h1>
        <p>{headingDescription}</p>

        {!isPlaceReviewMode && (
          <p className="list-page-feedback-note">
            Bizim Mekanlar henüz gelişmeye devam ediyor. Her türlü hata, öneri ya da fikir için{" "}
            <a href="mailto:3kutlu@gmail.com?subject=Bizim%20Mekanlar%20Geri%20Bildirim">
              bizimle iletişime geçebilirsiniz.
            </a>
          </p>
        )}

        {isPlaceReviewMode && (
          <button
            className="place-review-reset-button"
            type="button"
            onClick={onClearPlaceReviewFilter}
          >
            Takip ettiklerin akışına dön
          </button>
        )}
      </div>

      {isPlaceReviewMode ? (
        <PlaceReviewFeed
          isActive={isActive}
          loadKey={placeReviewLoadKey}
          placeId={placeReviewFilter.placeId}
          currentUserId={currentUserId}
          onOpenPlace={onOpenPlace}
          onOpenUser={onOpenUser}
          onOpenNote={onOpenNote}
        />
      ) : (
        <TabbedFeed
          isActive={isActive}
          refreshKey={refreshKey}
          currentUserId={currentUserId}
          onOpenPlace={onOpenPlace}
          onOpenUser={onOpenUser}
          onOpenNote={onOpenNote}
        />
      )}
    </section>
  );
}
