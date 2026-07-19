/*
 * Map feature split into page, widgets and pure helpers.
 * Behavior is intentionally preserved from the pre-refactor screen.
 */

import { MESSAGE_KEY, t } from "../../i18n/messages.js";
import { supabase } from "../../supabase.js";
import { MAX_NOTE_PHOTOS, NOTE_PHOTO_UPLOAD_COPY } from "../../utils/notePhotos.js";
import { getVenueCategoryFromGooglePlace, getVenueCategoryIcon, getVenueCategoryLabel, isSupportedVenueCategory } from "../../utils/venueCategory.js";
import { MAP_NOTE_LIMIT, buildMapClusters, cleanText, formatAverageRating, formatReviewLinkLabel, getLocalDateInputValue, getPlaceEligibility, getSelectedPlaceFromGooglePlace, getSelectedPlaceFromMapRow, isMessageKey } from "./mapUtils.js";
import { AdvancedMarker, Circle, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppIcon, { CollectionIcon } from "../../components/AppIcon.jsx";
import { getCollectionColorClassName } from "../../utils/collectionColors.js";

export function MapReference({ mapRef }) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;

    return () => {
      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
  }, [map, mapRef]);

  return null;
}

export function InitialLocationFocus({ userLocation, focusLockRef }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !userLocation || focusLockRef.current) {
      return;
    }

    map.panTo(userLocation);
    map.setZoom(16);
    focusLockRef.current = true;
  }, [focusLockRef, map, userLocation]);

  return null;
}

export function ExternalPlaceFocus({ place, focusLockRef, onFocus }) {
  const map = useMap();
  const placesLibrary = useMapsLibrary("places");
  const handledRequestRef = useRef(null);

  useEffect(() => {
    if (!map || !place?.requestId || !place?.location) {
      return undefined;
    }

    if (handledRequestRef.current === place.requestId) {
      return undefined;
    }

    const latitude = Number(place.location.lat);
    const longitude = Number(place.location.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return undefined;
    }

    const googlePlaceId = cleanText(place.id);
    const initialVenueCategoryCode =
      cleanText(place.venueCategoryCode) || null;
    const needsVenueLookup =
      !isSupportedVenueCategory(initialVenueCategoryCode) &&
      Boolean(googlePlaceId);

    /*
     * Liste/not kartından gelindiğinde eski Places kayıtlarında kategori
     * boş olabilir. Places library hazır değilken "desteklenmiyor" kartını
     * erken açmak yerine, Google tür bilgisini alabilene kadar bekliyoruz.
     */
    if (
      needsVenueLookup &&
      (!placesLibrary || typeof placesLibrary.Place !== "function")
    ) {
      return undefined;
    }

    let isCancelled = false;

    const focusResolvedPlace = async () => {
      let venueCategoryCode = initialVenueCategoryCode;

      if (needsVenueLookup) {
        try {
          const googlePlace = new placesLibrary.Place({ id: googlePlaceId });

          await googlePlace.fetchFields({
            fields: ["primaryType", "types"],
          });

          const resolvedVenueCategoryCode =
            getVenueCategoryFromGooglePlace(googlePlace);

          if (isSupportedVenueCategory(resolvedVenueCategoryCode)) {
            venueCategoryCode = resolvedVenueCategoryCode;
          }
        } catch (error) {
          console.warn(
            "Liste/not kartından açılan mekanın kategorisi doğrulanamadı:",
            error
          );
        }
      }

      if (isCancelled) {
        return;
      }

      handledRequestRef.current = place.requestId;
      focusLockRef.current = true;

      map.panTo({ lat: latitude, lng: longitude });
      map.setZoom(17);

      onFocus({
        placeId: Number(place.placeId) || null,
        id: googlePlaceId,
        name: cleanText(place.name) || "İsimsiz mekan",
        address: cleanText(place.address),
        cityName: cleanText(place.cityName),
        postalCode: cleanText(place.postalCode),
        venueCategoryCode: venueCategoryCode || null,
        isEligible: isSupportedVenueCategory(venueCategoryCode),
        openAction: cleanText(place.openAction) || null,
        selectionSource: "external-place-target",
        location: {
          lat: latitude,
          lng: longitude,
        },
      });
    };

    void focusResolvedPlace();

    return () => {
      isCancelled = true;
    };
  }, [focusLockRef, map, onFocus, place, placesLibrary]);

  return null;
}

export function UserLocationMarker({ userLocation }) {
  if (!userLocation) {
    return null;
  }

  const position = {
    lat: userLocation.lat,
    lng: userLocation.lng,
  };

  const accuracy =
    Number.isFinite(userLocation.accuracy) && userLocation.accuracy > 0
      ? userLocation.accuracy
      : null;

  return (
    <>
      {accuracy && (
        <Circle
          center={position}
          radius={accuracy}
          fillColor="#4285F4"
          fillOpacity={0.12}
          strokeColor="#4285F4"
          strokeOpacity={0.18}
          strokeWeight={1}
          clickable={false}
          zIndex={1}
        />
      )}

      <AdvancedMarker
        position={position}
        anchorLeft="-50%"
        anchorTop="-50%"
        zIndex={50}
        clickable={false}
        title="Konumun"
      >
        <div className="user-location-marker" aria-hidden="true">
          <span className="user-location-dot" />
        </div>
      </AdvancedMarker>
    </>
  );
}

export function SelectedPlaceMarker({ selectedPlace }) {
  /*
   * Liste/not kartından gelen mekanların zaten kayıtlı bir PlaceId'si var.
   * Aynı konumda sosyal mekan markerı da bulunduğunda ikinci kırmızı pin
   * üst üste biniyordu. Kırmızı seçili-mekan pini sadece arama/POI ile
   * seçilmiş, henüz kayıtlı olmayan mekanlarda gösterilir.
   */
  if (
    !selectedPlace?.location ||
    selectedPlace?.selectionSource === "social-map-marker" ||
    Number(selectedPlace?.placeId) > 0
  ) {
    return null;
  }

  return (
    <AdvancedMarker
      position={selectedPlace.location}
      anchorLeft="-50%"
      anchorTop="-50%"
      zIndex={90}
      clickable={false}
      title={`Seçilen mekan: ${selectedPlace.name}`}
    >
      <div className="selected-place-marker" aria-hidden="true">
        <AppIcon name="map-pin" />
      </div>
    </AdvancedMarker>
  );
}

export function SocialVenueNotesLayer({ isActive, refreshKey, onPlaceSelected }) {
  const map = useMap();
  const placesLibrary = useMapsLibrary("places");
  const [places, setPlaces] = useState([]);
  const [zoom, setZoom] = useState(15);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef(null);

  const loadVisiblePlaces = useCallback(async () => {
    if (!map || !isActive) {
      return;
    }

    const bounds = map.getBounds();

    if (!bounds) {
      return;
    }

    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    const south = Number(southWest?.lat?.());
    const west = Number(southWest?.lng?.());
    const north = Number(northEast?.lat?.());
    const east = Number(northEast?.lng?.());

    if (![south, west, north, east].every(Number.isFinite)) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const mapZoom = Number(map.getZoom());

    if (Number.isFinite(mapZoom)) {
      setZoom(mapZoom);
    }

    const { data, error } = await supabase.rpc("GetVisibleMapVenueNotes", {
      p_south: south,
      p_west: west,
      p_north: north,
      p_east: east,
      p_limit: MAP_NOTE_LIMIT,
    });

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (error) {
      console.error("Haritadaki sosyal mekan notları alınamadı:", error);
      return;
    }

    setPlaces(data ?? []);
  }, [isActive, map]);

  useEffect(() => {
    if (!map || !isActive) {
      return undefined;
    }

    const scheduleLoad = () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = window.setTimeout(() => {
        void loadVisiblePlaces();
      }, 180);
    };

    const listener = map.addListener("idle", scheduleLoad);
    scheduleLoad();

    return () => {
      listener.remove();

      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [isActive, loadVisiblePlaces, map, refreshKey]);

  const clusters = useMemo(() => buildMapClusters(places, zoom), [places, zoom]);

  const openPlace = useCallback(
    async (place) => {
      let selectedPlace = getSelectedPlaceFromMapRow(place);

      if (
        !selectedPlace.id ||
        !Number.isFinite(selectedPlace.location.lat) ||
        !Number.isFinite(selectedPlace.location.lng)
      ) {
        return;
      }

      /*
       * v1.5.0 öncesinde kaydedilen mekanların VenueCategoryCode alanı boş.
       * Social marker seçimi Places tablosundan geldiği için bu kayıtlar
       * Google tür kontrolünü atlıyordu ve kart yanlışlıkla "desteklenmiyor"
       * durumuna düşüyordu. Sadece kategori eksikse, placeId ile Google'dan
       * tür bilgisini sessizce tamamla.
       */
      if (
        !isSupportedVenueCategory(selectedPlace.venueCategoryCode) &&
        placesLibrary &&
        typeof placesLibrary.Place === "function"
      ) {
        try {
          const googlePlace = new placesLibrary.Place({
            id: selectedPlace.id,
          });

          await googlePlace.fetchFields({
            fields: ["primaryType", "types"],
          });

          const venueCategoryCode =
            getVenueCategoryFromGooglePlace(googlePlace);

          if (isSupportedVenueCategory(venueCategoryCode)) {
            selectedPlace = {
              ...selectedPlace,
              venueCategoryCode,
              isEligible: true,
            };
          }
        } catch (error) {
          console.warn(
            "Harita markerı için mekan kategorisi doğrulanamadı:",
            error
          );
        }
      }

      map?.panTo(selectedPlace.location);
      onPlaceSelected(selectedPlace);
    },
    [map, onPlaceSelected, placesLibrary]
  );

  const openCluster = (cluster) => {
    if (!map || !cluster?.position) {
      return;
    }

    const nextZoom = Math.min((Number(map.getZoom()) || zoom) + 2, 18);
    map.panTo(cluster.position);
    map.setZoom(nextZoom);
  };

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.isCluster) {
          return (
            <AdvancedMarker
              key={`cluster-${cluster.id}`}
              position={cluster.position}
              anchorLeft="-50%"
              anchorTop="-50%"
              zIndex={70}
              title={`${cluster.places.length} mekan`}
              onClick={() => openCluster(cluster)}
            >
              <div className="social-map-cluster-marker" aria-hidden="true">
                <span>{cluster.places.length}</span>
              </div>
            </AdvancedMarker>
          );
        }

        const place = cluster.places[0];
        const venueIcon = getVenueCategoryIcon(place?.VenueCategoryCode);
        const reviewCount = Math.max(0, Number(place?.VisibleNoteCount) || 0);
        const savedListCount = Math.max(0, Number(place?.SavedListCount) || 0);
        const hasSavedList = savedListCount > 0;
        const colorClassName = getCollectionColorClassName(place?.PrimaryListColorCode);
        const markerClassName = hasSavedList
          ? `social-map-venue-marker social-map-venue-marker-saved ${colorClassName}`
          : "social-map-venue-marker";
        const markerTitleParts = [
          place?.Name || "Mekan",
          reviewCount > 0 ? `${reviewCount} yorum` : "",
          savedListCount > 0 ? `${savedListCount} liste` : "",
        ].filter(Boolean);
        const badgeCount = reviewCount > 1
          ? reviewCount
          : savedListCount > 1
            ? savedListCount
            : 0;

        return (
          <AdvancedMarker
            key={`venue-${place.PlaceId}`}
            position={{
              lat: Number(place.Latitude),
              lng: Number(place.Longitude),
            }}
            anchorLeft="-50%"
            anchorTop="-100%"
            zIndex={hasSavedList ? 68 : 65}
            title={markerTitleParts.join(" · ")}
            onClick={() => {
              void openPlace(place);
            }}
          >
            <div className={markerClassName} aria-hidden="true">
              <span className="social-map-venue-marker-icon">
                {hasSavedList ? (
                  <CollectionIcon value={place?.PrimaryListIcon || "bookmark"} />
                ) : (
                  venueIcon
                )}
              </span>
              {badgeCount > 0 && (
                <span className="social-map-venue-marker-count">{badgeCount > 9 ? "9+" : badgeCount}</span>
              )}
            </div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}

export function PoiPlaceClickHandler({ onPlaceSelected }) {
  const map = useMap();
  const placesLibrary = useMapsLibrary("places");
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!map || !placesLibrary || typeof placesLibrary.Place !== "function") {
      return undefined;
    }

    const listener = map.addListener("click", async (event) => {
      const placeId = cleanText(event?.placeId);

      if (!placeId) {
        return;
      }

      event.stop?.();
      const requestId = ++requestIdRef.current;

      try {
        const place = new placesLibrary.Place({ id: placeId });

        await place.fetchFields({
          fields: [
            "displayName",
            "formattedAddress",
            "addressComponents",
            "location",
            "id",
            "primaryType",
            "types",
          ],
        });

        if (requestId !== requestIdRef.current || !place.location) {
          return;
        }

        const selectedPlace = getSelectedPlaceFromGooglePlace(place);
        const latitude = Number(selectedPlace.location.lat);
        const longitude = Number(selectedPlace.location.lng);

        if (
          !selectedPlace.id ||
          !selectedPlace.name ||
          !selectedPlace.address ||
          !selectedPlace.cityName ||
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return;
        }

        map.panTo(selectedPlace.location);
        onPlaceSelected(selectedPlace);
      } catch (error) {
        console.error("Haritadaki mekan seçilemedi:", error);
      }
    });

    return () => listener.remove();
  }, [map, onPlaceSelected, placesLibrary]);

  return null;
}

export function PlaceSearch({ onPlaceSelected }) {
  const map = useMap();
  const placesLibrary = useMapsLibrary("places");

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const sessionTokenRef = useRef(null);
  const requestIdRef = useRef(0);
  const blurTimerRef = useRef(null);

  useEffect(() => {
    if (!placesLibrary) {
      return;
    }

    sessionTokenRef.current = new placesLibrary.AutocompleteSessionToken();
  }, [placesLibrary]);

  useEffect(() => {
    if (!placesLibrary) {
      return;
    }

    const input = cleanText(query);
    const requestId = ++requestIdRef.current;

    if (input.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setErrorMessage("");
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        setErrorMessage("");

        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new placesLibrary.AutocompleteSessionToken();
        }

        const { suggestions: rawSuggestions } =
          await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions(
            {
              input,
              includedRegionCodes: ["tr"],
              language: "tr",
              sessionToken: sessionTokenRef.current,
            }
          );

        if (requestId !== requestIdRef.current) {
          return;
        }

        const cleanSuggestions = rawSuggestions
          .filter((item) => item.placePrediction)
          .map((item) => {
            const prediction = item.placePrediction;

            return {
              prediction,
              id:
                cleanText(prediction.placeId) ||
                cleanText(prediction.text?.text),
              title:
                cleanText(prediction.mainText?.text) ||
                cleanText(prediction.text?.text),
              subtitle: cleanText(prediction.secondaryText?.text),
            };
          })
          .filter((item) => item.title);

        setSuggestions(cleanSuggestions);
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        console.error("Autocomplete isteği başarısız:", error);
        setSuggestions([]);
        setErrorMessage(MESSAGE_KEY.PLACE_SUGGESTIONS_LOAD_FAILED);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, placesLibrary]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) {
        window.clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  const handleSelect = async (suggestion) => {
    try {
      const place = suggestion.prediction.toPlace();

      await place.fetchFields({
        fields: [
          "displayName",
          "formattedAddress",
          "addressComponents",
          "location",
          "viewport",
          "id",
          "primaryType",
          "types",
        ],
      });

      if (!place.location || !map) {
        return;
      }

      const selectedPlace = getSelectedPlaceFromGooglePlace(place);
      const latitude = Number(selectedPlace.location.lat);
      const longitude = Number(selectedPlace.location.lng);

      if (
        !selectedPlace.id ||
        !selectedPlace.address ||
        !selectedPlace.cityName ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return;
      }

      if (place.viewport) {
        map.fitBounds(place.viewport);
      } else {
        map.panTo(selectedPlace.location);
        map.setZoom(17);
      }

      setQuery(selectedPlace.name);
      setSuggestions([]);
      onPlaceSelected(selectedPlace);
      sessionTokenRef.current = new placesLibrary.AutocompleteSessionToken();
    } catch (error) {
      console.error("Mekan seçilirken hata oluştu:", error);
      setErrorMessage(MESSAGE_KEY.PLACE_SELECTION_FAILED);
    }
  };

  return (
    <div className="place-search">
      <input
        className="place-search-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (blurTimerRef.current) {
            window.clearTimeout(blurTimerRef.current);
          }
        }}
        onBlur={() => {
          blurTimerRef.current = window.setTimeout(() => {
            setSuggestions([]);
          }, 180);
        }}
        placeholder="Mekan ara..."
        aria-label="Mekan ara"
        autoComplete="off"
      />

      {(suggestions.length > 0 || isLoading || errorMessage) && (
        <div className="place-search-results">
          {isLoading && <div className="place-search-status">Aranıyor...</div>}

          {!isLoading &&
            suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="place-search-result"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(suggestion)}
              >
                <span className="place-search-result-title">{suggestion.title}</span>
                {suggestion.subtitle && (
                  <span className="place-search-result-subtitle">{suggestion.subtitle}</span>
                )}
              </button>
            ))}

          {errorMessage && !isLoading && (
            <div className="place-search-status place-search-error">
              {t(errorMessage)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SelectedPlaceCard({
  selectedPlace,
  reviewSummary,
  cardRef,
  onTitleClick,
  onAddNote,
  onOpenSave,
  onOpenDetail,
  onShare,
  onClose,
}) {
  const canAddNote = getPlaceEligibility(selectedPlace);
  const reviewCount = Math.max(0, Number(reviewSummary?.count) || 0);
  const venueIcon = getVenueCategoryIcon(selectedPlace?.venueCategoryCode);
  const venueLabel = getVenueCategoryLabel(selectedPlace?.venueCategoryCode);
  const detailPlaceId =
    Number(reviewSummary?.placeId) || Number(selectedPlace?.placeId) || null;
  const canOpenDetail = Boolean(detailPlaceId && onOpenDetail);
  const handleTitleClick = canOpenDetail ? onOpenDetail : onTitleClick;
  const titleHint = canOpenDetail
    ? "Mekan sayfasını aç"
    : "Mekanı haritada göster";

  const handleTitleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleTitleClick();
    }
  };

  return (
    <div ref={cardRef} className="selected-place-card">
      <button
        type="button"
        className="selected-place-share-icon"
        onClick={onShare}
        aria-label="Mekanı paylaş"
        title="Mekanı paylaş"
      >
        <AppIcon name="share-fat" />
      </button>

      <button
        type="button"
        className="selected-place-close"
        onClick={onClose}
        aria-label="Seçili mekanı kapat"
        title="Mekanı kapat"
      >
        <AppIcon name="x" />
      </button>

      <div className="selected-place-copy">
        <strong
          className={`selected-place-title${
            canOpenDetail ? " selected-place-title-detail" : ""
          }`}
          role="button"
          tabIndex={0}
          title={titleHint}
          onClick={handleTitleClick}
          onKeyDown={handleTitleKeyDown}
        >
          <span className="venue-category-icon venue-category-icon-map" title={venueLabel}>
            {venueIcon}
          </span>
          {selectedPlace.name}
        </strong>

        {selectedPlace.address && <span>{selectedPlace.address}</span>}

        {canAddNote && (
          <p className="selected-place-rating" aria-live="polite">
            {reviewSummary?.isRatingLoading
              ? "Genel puan yükleniyor..."
              : Number(reviewSummary?.ratingCount) > 0
                ? <><span>{formatAverageRating(reviewSummary?.averageRating)} / 5</span><AppIcon name="star" className="selected-place-rating-star" /></>
                : "Henüz puan yok"}
          </p>
        )}
      </div>

      {canAddNote && reviewSummary?.isLoading && (
        <p className="selected-place-review-status">Yorumlar kontrol ediliyor...</p>
      )}

      {canAddNote && !reviewSummary?.isLoading && reviewCount === 0 && (
        <p className="selected-place-review-empty">İlk yorumu sen yap.</p>
      )}

      {!canAddNote && (
        <p className="selected-place-unsupported">
          Bu uygulamada yalnızca yeme-içme, spor ve kültür/aktivite mekanlarına not ekleyebilirsin.
        </p>
      )}

      {canAddNote && (
        <div
          className={`selected-place-actions${
            !reviewSummary?.isLoading && reviewCount > 0
              ? " selected-place-actions-with-reviews"
              : ""
          }`}
        >
          <button type="button" className="selected-place-save" onClick={onOpenSave}>
            Kaydet
          </button>

          {!reviewSummary?.isLoading && reviewCount > 0 && (
            <button
              type="button"
              className="selected-place-review-button"
              onClick={onOpenDetail}
              disabled={!canOpenDetail}
            >
              {formatReviewLinkLabel(reviewCount)}
            </button>
          )}

          <button type="button" className="selected-place-add-note" onClick={onAddNote}>
            Bu mekana not ekle
          </button>
        </div>
      )}
    </div>
  );
}

export function PlaceSaveSheet({
  placeName,
  lists,
  isLoading,
  savingListId,
  errorMessage,
  notice,
  onClose,
  onToggleList,
  onRetry,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !savingListId) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, savingListId]);

  const handleBackdropMouseDown = (event) => {
    if (!savingListId && event.target === event.currentTarget) {
      onClose();
    }
  };

  const savedLists = lists.filter((list) => Boolean(list?.IsSaved));
  const unsavedLists = lists.filter((list) => !list?.IsSaved);

  const renderListRow = (list) => {
    const listId = Number(list?.UserPlaceListId);
    const isSaved = Boolean(list?.IsSaved);
    const isSaving = savingListId === listId;
    const placeCount = Math.max(0, Number(list?.PlaceCount) || 0);
    const colorClassName = getCollectionColorClassName(list?.ColorCode);

    return (
      <button
        className={`place-save-list-row ${colorClassName}${
          isSaved ? " place-save-list-row-saved" : ""
        }`}
        type="button"
        key={listId}
        disabled={Boolean(savingListId)}
        aria-pressed={isSaved}
        onClick={() => onToggleList(list)}
      >
        <span className="place-save-list-icon" aria-hidden="true">
          {isSaving ? <AppIcon name="circle-notch" className="place-save-list-spinner" /> : isSaved ? <AppIcon name="check" /> : <CollectionIcon value={list?.Icon} />}
        </span>

        <span className="place-save-list-copy">
          <strong>{list?.Name || "İsimsiz liste"}</strong>
          <small>{list?.Description || `${placeCount} mekan`}</small>
        </span>

        <span className="place-save-list-status">
          {isSaving
            ? "İşleniyor..."
            : isSaved
              ? "Kaydedildi"
              : "Kaydet"}
        </span>
      </button>
    );
  };

  return (
    <div
      className="place-save-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        ref={dialogRef}
        className="place-save-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-save-title"
        tabIndex={-1}
      >
        <div className="place-save-sheet-header">
          <div>
            <p className="eyebrow">KAYDET</p>
            <h2 id="place-save-title">Listelerine ekle</h2>
            <p>{placeName || "Bu mekan"}</p>
          </div>

          <button
            className="place-save-sheet-close"
            type="button"
            onClick={onClose}
            disabled={Boolean(savingListId)}
            aria-label="Kapat"
          >
            <AppIcon name="x" />
          </button>
        </div>

        {isLoading && (
          <div className="place-save-state">
            <span className="place-save-loading-dot" aria-hidden="true" />
            Listelerin yükleniyor...
          </div>
        )}

        {!isLoading && errorMessage && (
          <div className="place-save-state place-save-state-error">
            <p>{errorMessage}</p>
            <button type="button" onClick={onRetry}>
              Tekrar dene
            </button>
          </div>
        )}

        {!isLoading && !errorMessage && lists.length === 0 && (
          <div className="place-save-state">
            <p>Kaydedebileceğin aktif bir listen yok.</p>
          </div>
        )}

        {!isLoading && !errorMessage && lists.length > 0 && (
          <>
            <p className="place-save-selection-summary" role="status">
              {savedLists.length > 0
                ? `Bu mekan ${savedLists.length} listende kayıtlı.`
                : "Bu mekan henüz listelerine kayıtlı değil."}
            </p>

            <div className="place-save-list" aria-label="Mekan listeleri">
              {savedLists.length > 0 && (
                <section className="place-save-list-section" aria-label="Kayıtlı listeler">
                  <p>Kayıtlı listeler</p>
                  {savedLists.map(renderListRow)}
                </section>
              )}

              {unsavedLists.length > 0 && (
                <section className="place-save-list-section" aria-label="Diğer listeler">
                  <p>{savedLists.length > 0 ? "Diğer listeler" : "Listelerin"}</p>
                  {unsavedLists.map(renderListRow)}
                </section>
              )}
            </div>

            {notice && (
              <p className="place-save-notice" role="status">
                {notice}
              </p>
            )}

            <p className="place-save-sheet-hint">
              Bir mekanı birden fazla listeye ekleyebilirsin.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

export function AddNoteModal({
  placeName,
  noteTitle,
  noteDraft,
  noteRating,
  noteVisitedDate,
  notePhotoDrafts,
  noteHasBeenSaved,
  isSaving,
  saveError,
  onTitleChange,
  onNoteChange,
  onRatingChange,
  onVisitedDateChange,
  onPhotosSelected,
  onRemovePhoto,
  onCancel,
  onSave,
}) {
  const titleInputRef = useRef(null);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  const today = getLocalDateInputValue();

  useEffect(() => {
    if (!noteHasBeenSaved) {
      titleInputRef.current?.focus();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [noteHasBeenSaved]);

  const handleKeyDown = (event) => {
    if (event.key === "Escape" && !isSaving) {
      onCancel();
    }
  };

  const handleBackdropMouseDown = (event) => {
    if (!isSaving && event.target === event.currentTarget) {
      onCancel();
    }
  };

  const validation = {
    title: !cleanText(noteTitle),
    rating:
      !Number.isInteger(Number(noteRating)) ||
      Number(noteRating) < 1 ||
      Number(noteRating) > 5,
    visitedDate: Boolean(noteVisitedDate) && noteVisitedDate > today,
    detail: !cleanText(noteDraft),
  };

  const canSaveNote =
    !validation.title &&
    !validation.rating &&
    !validation.visitedDate &&
    !validation.detail;
  const canSave = noteHasBeenSaved
    ? notePhotoDrafts.length > 0
    : canSaveNote;
  const showTitleError = !noteHasBeenSaved && hasAttemptedSave && validation.title;
  const showRatingError = !noteHasBeenSaved && hasAttemptedSave && validation.rating;
  const showVisitedDateError = !noteHasBeenSaved && hasAttemptedSave && validation.visitedDate;
  const showDetailError = !noteHasBeenSaved && hasAttemptedSave && validation.detail;

  const handleSaveAttempt = () => {
    if (isSaving) {
      return;
    }

    if (!canSave) {
      setHasAttemptedSave(true);
      return;
    }

    onSave();
  };

  return (
    <div
      className="note-modal-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        className="note-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-modal-title"
        onKeyDown={handleKeyDown}
      >
        <div className="note-modal-heading">
          <p className="eyebrow">YENİ NOT</p>
          <h2 id="note-modal-title">{placeName}</h2>
        </div>

        {noteHasBeenSaved && (
          <p className="note-photo-upload-notice" role="status">
            Notun kaydedildi. Seçtiğin fotoğrafları yüklemek için devam et.
          </p>
        )}

        <label className="note-modal-field">
          <span>Başlık</span>
          <input
            ref={titleInputRef}
            className="note-modal-input"
            type="text"
            value={noteTitle}
            disabled={isSaving || noteHasBeenSaved}
            aria-invalid={showTitleError}
            aria-describedby={showTitleError ? "note-title-error" : undefined}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Kısa bir başlık yaz"
            maxLength={120}
          />
          {showTitleError && (
            <p id="note-title-error" className="note-modal-field-error" role="alert">
              {t(MESSAGE_KEY.NOTE_TITLE_REQUIRED)}
            </p>
          )}
        </label>

        <div className="note-modal-field">
          <span>Puanın</span>
          <div
            className={`note-rating-picker${
              showRatingError ? " note-rating-picker-error" : ""
            }`}
            role="radiogroup"
            aria-label="Puanın"
            aria-describedby={showRatingError ? "note-rating-error" : undefined}
          >
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                className={
                  rating <= Number(noteRating)
                    ? "note-rating-star note-rating-star-active"
                    : "note-rating-star"
                }
                type="button"
                key={rating}
                role="radio"
                aria-checked={Number(noteRating) === rating}
                aria-label={`${rating} yıldız`}
                disabled={isSaving || noteHasBeenSaved}
                onClick={() => onRatingChange(rating)}
              >
                <AppIcon name={rating <= Number(noteRating) ? "star-fill" : "star"} />
              </button>
            ))}
            <strong>{noteRating ? `${noteRating} / 5` : "Puan ver"}</strong>
          </div>
          {showRatingError && (
            <p id="note-rating-error" className="note-modal-field-error" role="alert">
              {t(MESSAGE_KEY.NOTE_RATING_REQUIRED)}
            </p>
          )}
        </div>

        <label className="note-modal-field">
          <span>
            Ziyaret tarihi
          </span>
          <input
            className="note-modal-input note-modal-date-input"
            type="date"
            value={noteVisitedDate}
            max={today}
            disabled={isSaving || noteHasBeenSaved}
            aria-invalid={showVisitedDateError}
            aria-describedby={
              showVisitedDateError ? "note-visited-date-error" : undefined
            }
            onChange={(event) => onVisitedDateChange(event.target.value)}
          />
          {showVisitedDateError && (
            <p
              id="note-visited-date-error"
              className="note-modal-field-error"
              role="alert"
            >
              Ziyaret tarihi gelecekte olamaz.
            </p>
          )}
        </label>

        <label className="note-modal-field">
          <span>Detay</span>
          <textarea
            className="note-modal-textarea"
            value={noteDraft}
            disabled={isSaving || noteHasBeenSaved}
            aria-invalid={showDetailError}
            aria-describedby={showDetailError ? "note-detail-error" : undefined}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Bu mekan hakkında ne düşünüyorsun?"
            aria-label="Not detayı"
            maxLength={1000}
          />
          {showDetailError && (
            <p id="note-detail-error" className="note-modal-field-error" role="alert">
              {t(MESSAGE_KEY.NOTE_DETAIL_REQUIRED)}
            </p>
          )}
        </label>

        <div className="note-photo-upload-field">
          <div className="note-photo-upload-heading">
            <span>Fotoğraflar <small>(opsiyonel)</small></span>
            <small>{notePhotoDrafts.length} / {MAX_NOTE_PHOTOS}</small>
          </div>

          {notePhotoDrafts.length < MAX_NOTE_PHOTOS && (
            <label className={`note-photo-picker${isSaving ? " note-photo-picker-disabled" : ""}`}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={isSaving}
                onChange={(event) => {
                  onPhotosSelected(event.target.files);
                  event.target.value = "";
                }}
              />
              <AppIcon name="camera-plus" className="note-photo-picker-icon" />
              <strong>Fotoğraf ekle</strong>
              <small>JPG, PNG veya WEBP · {NOTE_PHOTO_UPLOAD_COPY}</small>
            </label>
          )}

          {notePhotoDrafts.length > 0 && (
            <div className="note-photo-draft-grid" aria-label="Seçilen fotoğraflar">
              {notePhotoDrafts.map((draft) => (
                <div className="note-photo-draft" key={draft.id}>
                  <img src={draft.previewUrl} alt="Seçilen fotoğraf ön izlemesi" />
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => onRemovePhoto(draft.id)}
                    aria-label={`${draft.name} fotoğrafını kaldır`}
                    title="Fotoğrafı kaldır"
                  >
                    <AppIcon name="x" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {saveError && (
          <p className="note-modal-error" role="alert">
            {isMessageKey(saveError) ? t(saveError) : saveError}
          </p>
        )}

        <div className="note-modal-actions">
          <button
            type="button"
            className="note-modal-cancel"
            disabled={isSaving}
            onClick={onCancel}
          >
            İptal
          </button>

          <button
            type="button"
            className={`note-modal-save${
              canSave ? "" : " note-modal-save-incomplete"
            }`}
            disabled={isSaving}
            aria-disabled={!canSave || isSaving}
            onClick={handleSaveAttempt}
          >
            {isSaving
              ? "Kaydediliyor..."
              : noteHasBeenSaved
                ? "Fotoğrafları yükle"
                : "Kaydet"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function MapBottomControls({
  userLocation,
  locationMessage,
  hasSelectedPlace,
  selectedPlaceCardHeight,
}) {
  const map = useMap();

  const goToMyLocation = () => {
    if (!map || !userLocation) {
      return;
    }

    map.panTo(userLocation);
    map.setZoom(16);
  };

  return (
    <div
      className={`map-bottom-controls${
        hasSelectedPlace ? " map-bottom-controls-with-card" : ""
      }`}
      style={
        hasSelectedPlace
          ? {
              "--selected-place-card-height": `${selectedPlaceCardHeight}px`,
            }
          : undefined
      }
    >
      {locationMessage && (
        <div className="location-message" role="status">
          {t(locationMessage)}
        </div>
      )}

      <button
        type="button"
        className="location-button"
        aria-label="Konumuma git"
        title={
          userLocation ? "Konumuma git" : "Konum bilgisi henüz alınamadı"
        }
        disabled={!userLocation}
        onClick={goToMyLocation}
      >
        <AppIcon name={userLocation ? "gps-fix" : "gps-slash"} />
      </button>
    </div>
  );
}
