import "../../css/map-page.css";

/*
 * Map feature split into page, widgets and pure helpers.
 * Behavior is intentionally preserved from the pre-refactor screen.
 */

import { MESSAGE_KEY, getErrorMessageKey, t } from "../../i18n/messages.js";
import { getNoteCreateErrorMessage, getPlaceSaveErrorMessage } from "../../utils/actionErrors.js";
import { supabase } from "../../supabase.js";
import { createNotePhotoDrafts, getPhotoSelectionError, revokeNotePhotoDrafts, uploadMyNotePhotoDrafts } from "../../utils/notePhotos.js";
import { ankaraCenter, cleanText, createPlaceNote, getLocalDateInputValue, getPartialPhotoUploadErrorMessage, getPlaceEligibility, getPlaceSavePayload } from "./mapUtils.js";
import { AddNoteModal, ExternalPlaceFocus, InitialLocationFocus, MapBottomControls, MapReference, PlaceSaveSheet, PlaceSearch, PoiPlaceClickHandler, SelectedPlaceCard, SelectedPlaceMarker, SocialVenueNotesLayer, UserLocationMarker } from "./MapWidgets.jsx";
import { APIProvider, Map } from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function MapPage({
  onNoteCreated,
  focusPlace,
  onFocusHandled,
  notesRefreshKey,
  isActive,
  onOpenPlaceDetail,
  onPlaceSaved,
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;

  const [userLocation, setUserLocation] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [selectedPlaceReviewSummary, setSelectedPlaceReviewSummary] = useState({
    count: 0,
    placeId: null,
    isLoading: false,
    averageRating: null,
    ratingCount: 0,
    isRatingLoading: false,
  });
  const [locationMessage, setLocationMessage] = useState("");

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteRating, setNoteRating] = useState(0);
  const [noteVisitedDate, setNoteVisitedDate] = useState("");
  const [notePhotoDrafts, setNotePhotoDrafts] = useState([]);
  const [createdNoteId, setCreatedNoteId] = useState(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSaveError, setNoteSaveError] = useState("");

  const [isPlaceSaveSheetOpen, setIsPlaceSaveSheetOpen] = useState(false);
  const [placeLists, setPlaceLists] = useState([]);
  const [placeListsLoading, setPlaceListsLoading] = useState(false);
  const [placeSaveError, setPlaceSaveError] = useState("");
  const [placeSaveNotice, setPlaceSaveNotice] = useState("");
  const [savingPlaceListId, setSavingPlaceListId] = useState(null);
  const [pendingExternalPlaceAction, setPendingExternalPlaceAction] = useState(null);
  const [mapPlacesRefreshKey, setMapPlacesRefreshKey] = useState(0);

  const locationMessageTimerRef = useRef(null);
  const hasShownLocationIssueRef = useRef(false);
  const selectedPlaceCardRef = useRef(null);
  const [selectedPlaceCardHeight, setSelectedPlaceCardHeight] = useState(0);
  const notePhotoDraftsRef = useRef([]);
  const mapRef = useRef(null);
  const initialFocusLockRef = useRef(false);
  const selectedPlaceRequestRef = useRef(0);
  const placeSaveSheetRequestRef = useRef(0);

  const clearLocationMessage = useCallback(() => {
    if (locationMessageTimerRef.current) {
      window.clearTimeout(locationMessageTimerRef.current);
      locationMessageTimerRef.current = null;
    }

    setLocationMessage("");
  }, []);

  const showInitialLocationIssue = useCallback(
    (message) => {
      if (hasShownLocationIssueRef.current) {
        return;
      }

      hasShownLocationIssueRef.current = true;
      clearLocationMessage();
      setLocationMessage(message);

      locationMessageTimerRef.current = window.setTimeout(() => {
        setLocationMessage("");
        locationMessageTimerRef.current = null;
      }, 10000);
    },
    [clearLocationMessage]
  );

  useEffect(() => {
    if (!navigator.geolocation) {
      showInitialLocationIssue(MESSAGE_KEY.LOCATION_UNSUPPORTED);
      return () => clearLocationMessage();
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        clearLocationMessage();
      },
      (error) => {
        const messageKeys = {
          1: MESSAGE_KEY.LOCATION_PERMISSION_DENIED,
          2: MESSAGE_KEY.LOCATION_UNAVAILABLE,
          3: MESSAGE_KEY.LOCATION_TIMEOUT,
        };

        showInitialLocationIssue(
          messageKeys[error.code] || MESSAGE_KEY.LOCATION_UNAVAILABLE
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearLocationMessage();
    };
  }, [clearLocationMessage, showInitialLocationIssue]);

  useEffect(() => {
    return () => {
      revokeNotePhotoDrafts(notePhotoDraftsRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!selectedPlace || !selectedPlaceCardRef.current) {
      setSelectedPlaceCardHeight(0);
      return undefined;
    }

    const card = selectedPlaceCardRef.current;
    const updateCardHeight = () => {
      setSelectedPlaceCardHeight(Math.ceil(card.getBoundingClientRect().height));
    };

    updateCardHeight();

    const observer = new ResizeObserver(updateCardHeight);
    observer.observe(card);

    return () => observer.disconnect();
  }, [selectedPlace, selectedPlaceReviewSummary]);

  useEffect(() => {
    if (!selectedPlace?.id) {
      setSelectedPlaceReviewSummary({
        count: 0,
        placeId: null,
        isLoading: false,
        averageRating: null,
        ratingCount: 0,
        isRatingLoading: false,
      });
      return;
    }

    const requestId = ++selectedPlaceRequestRef.current;
    const fallbackCount = Math.max(0, Number(selectedPlace.reviewCount) || 0);

    setSelectedPlaceReviewSummary({
      count: fallbackCount,
      placeId: Number(selectedPlace.placeId) || null,
      isLoading: true,
      averageRating: null,
      ratingCount: 0,
      isRatingLoading: true,
    });

    const loadPlaceCardSummary = async () => {
      const [visibleReviewResult, ratingResult] = await Promise.all([
        supabase.rpc("GetPlaceVisibleReviewSummary", {
          p_google_place_id: selectedPlace.id,
        }),
        supabase.rpc("GetPlaceRatingSummary", {
          p_google_place_id: selectedPlace.id,
        }),
      ]);

      if (requestId !== selectedPlaceRequestRef.current) {
        return;
      }

      if (visibleReviewResult.error) {
        console.error(
          "Mekan görünür yorum özeti alınamadı:",
          visibleReviewResult.error
        );
      }

      if (ratingResult.error) {
        console.error("Mekan genel puanı alınamadı:", ratingResult.error);
      }

      const visibleSummary = Array.isArray(visibleReviewResult.data)
        ? visibleReviewResult.data[0]
        : visibleReviewResult.data;
      const ratingSummary = Array.isArray(ratingResult.data)
        ? ratingResult.data[0]
        : ratingResult.data;

      setSelectedPlaceReviewSummary({
        count: visibleReviewResult.error
          ? fallbackCount
          : Math.max(0, Number(visibleSummary?.VisibleReviewCount) || 0),
        placeId:
          Number(visibleSummary?.PlaceId) ||
          Number(ratingSummary?.PlaceId) ||
          Number(selectedPlace.placeId) ||
          null,
        isLoading: false,
        averageRating: ratingResult.error
          ? null
          : Number.isFinite(Number(ratingSummary?.AverageRating))
            ? Number(ratingSummary.AverageRating)
            : null,
        ratingCount: ratingResult.error
          ? 0
          : Math.max(0, Number(ratingSummary?.RatingCount) || 0),
        isRatingLoading: false,
      });
    };

    void loadPlaceCardSummary();
  }, [
    notesRefreshKey,
    selectedPlace?.id,
    selectedPlace?.placeId,
    selectedPlace?.reviewCount,
  ]);

  const resetNoteForm = useCallback(() => {
    revokeNotePhotoDrafts(notePhotoDraftsRef.current);
    notePhotoDraftsRef.current = [];
    setNoteTitle("");
    setNoteDraft("");
    setNoteRating(0);
    setNoteVisitedDate(getLocalDateInputValue());
    setNotePhotoDrafts([]);
    setCreatedNoteId(null);
    setNoteSaveError("");
  }, []);

  const resetPlaceSaveSheet = useCallback(() => {
    placeSaveSheetRequestRef.current += 1;
    setIsPlaceSaveSheetOpen(false);
    setPlaceLists([]);
    setPlaceListsLoading(false);
    setPlaceSaveError("");
    setPlaceSaveNotice("");
    setSavingPlaceListId(null);
  }, []);

  const handleNoteTitleChange = useCallback((value) => {
    setNoteTitle(value);
    setNoteSaveError("");
  }, []);

  const handleNoteDraftChange = useCallback((value) => {
    setNoteDraft(value);
    setNoteSaveError("");
  }, []);

  const handleNoteRatingChange = useCallback((value) => {
    setNoteRating(value);
    setNoteSaveError("");
  }, []);

  const handleNoteVisitedDateChange = useCallback((value) => {
    setNoteVisitedDate(value);
    setNoteSaveError("");
  }, []);

  const handleNotePhotosSelected = useCallback((files) => {
    const selectedFiles = Array.from(files ?? []);
    const selectionError = getPhotoSelectionError(
      selectedFiles,
      notePhotoDraftsRef.current.length
    );

    if (selectionError) {
      setNoteSaveError(selectionError);
      return;
    }

    const nextDrafts = [
      ...notePhotoDraftsRef.current,
      ...createNotePhotoDrafts(selectedFiles),
    ];

    notePhotoDraftsRef.current = nextDrafts;
    setNotePhotoDrafts(nextDrafts);
    setNoteSaveError("");
  }, []);

  const handleRemoveNotePhotoDraft = useCallback((draftId) => {
    const currentDrafts = notePhotoDraftsRef.current;
    const removedDraft = currentDrafts.find((draft) => draft.id === draftId);

    if (removedDraft) {
      revokeNotePhotoDrafts([removedDraft]);
    }

    const nextDrafts = currentDrafts.filter((draft) => draft.id !== draftId);
    notePhotoDraftsRef.current = nextDrafts;
    setNotePhotoDrafts(nextDrafts);
    setNoteSaveError("");
  }, []);

  const handlePlaceSelected = useCallback(
    (place) => {
      setPendingExternalPlaceAction(null);
      setSelectedPlace(place);
      setIsNoteModalOpen(false);
      resetNoteForm();
      resetPlaceSaveSheet();
    },
    [resetNoteForm, resetPlaceSaveSheet]
  );

  const handleExternalPlaceFocus = useCallback(
    (place) => {
      const openAction = ["save", "note"].includes(
        String(place?.openAction ?? "").trim().toLowerCase()
      )
        ? String(place.openAction).trim().toLowerCase()
        : null;

      setSelectedPlace(place);
      setIsNoteModalOpen(false);
      resetNoteForm();
      resetPlaceSaveSheet();
      setPendingExternalPlaceAction(openAction);
      onFocusHandled?.();
    },
    [onFocusHandled, resetNoteForm, resetPlaceSaveSheet]
  );

  const clearSelectedPlace = useCallback(() => {
    if (isSavingNote || savingPlaceListId) {
      return;
    }

    selectedPlaceRequestRef.current += 1;
    setIsNoteModalOpen(false);
    resetNoteForm();
    resetPlaceSaveSheet();
    setPendingExternalPlaceAction(null);
    setSelectedPlace(null);
    setSelectedPlaceReviewSummary({
      count: 0,
      placeId: null,
      isLoading: false,
      averageRating: null,
      ratingCount: 0,
      isRatingLoading: false,
    });
  }, [isSavingNote, resetNoteForm, resetPlaceSaveSheet, savingPlaceListId]);

  const goToSelectedPlace = useCallback(() => {
    if (!mapRef.current || !selectedPlace?.location) {
      return;
    }

    mapRef.current.panTo(selectedPlace.location);
    mapRef.current.setZoom(17);
  }, [selectedPlace]);

  const openNoteModal = () => {
    if (!selectedPlace || !getPlaceEligibility(selectedPlace)) {
      return;
    }

    resetNoteForm();
    setIsNoteModalOpen(true);
  };

  const closeNoteModal = () => {
    if (isSavingNote) {
      return;
    }

    setIsNoteModalOpen(false);
    resetNoteForm();
  };

  const openPlaceSaveSheet = useCallback(async () => {
    if (!selectedPlace?.id) {
      return;
    }

    const requestId = ++placeSaveSheetRequestRef.current;

    setIsPlaceSaveSheetOpen(true);
    setPlaceListsLoading(true);
    setPlaceSaveError("");
    setPlaceSaveNotice("");

    const { data, error } = await supabase.rpc("GetMyPlaceListsForPlaceV3", {
      p_google_place_id: selectedPlace.id,
    });

    if (requestId !== placeSaveSheetRequestRef.current) {
      return;
    }

    if (error) {
      console.error("Mekan listeleri alınamadı:", error);
      setPlaceLists([]);
      setPlaceSaveError(
        error.message || "Mekan listelerin şu an yüklenemedi. Tekrar dene."
      );
    } else {
      setPlaceLists(data ?? []);
    }

    setPlaceListsLoading(false);
  }, [selectedPlace?.id]);

  const closePlaceSaveSheet = useCallback(() => {
    if (savingPlaceListId) {
      return;
    }

    resetPlaceSaveSheet();
  }, [resetPlaceSaveSheet, savingPlaceListId]);

  useEffect(() => {
    if (!pendingExternalPlaceAction || !selectedPlace) {
      return;
    }

    const action = pendingExternalPlaceAction;
    setPendingExternalPlaceAction(null);

    if (action === "note") {
      if (getPlaceEligibility(selectedPlace)) {
        resetNoteForm();
        setIsNoteModalOpen(true);
      }
      return;
    }

    if (action === "save") {
      void openPlaceSaveSheet();
    }
  }, [
    openPlaceSaveSheet,
    pendingExternalPlaceAction,
    resetNoteForm,
    selectedPlace,
  ]);

  const togglePlaceInList = useCallback(
    async (list) => {
      const listId = Number(list?.UserPlaceListId);

      if (
        !selectedPlace ||
        savingPlaceListId ||
        !Number.isInteger(listId) ||
        listId <= 0
      ) {
        return;
      }

      let placePayload;

      try {
        placePayload = getPlaceSavePayload(selectedPlace);
      } catch (error) {
        setPlaceSaveError(
          t(getErrorMessageKey(error, MESSAGE_KEY.PLACE_DATA_INCOMPLETE))
        );
        return;
      }

      const shouldSave = !list?.IsSaved;

      setSavingPlaceListId(listId);
      setPlaceSaveError("");
      setPlaceSaveNotice("");

      const { data, error } = await supabase.rpc("SetMyPlaceListItemV2", {
        p_user_place_list_id: listId,
        p_should_save: shouldSave,
        ...placePayload,
      });

      if (error) {
        console.error("Mekan listeye kaydedilemedi:", error);
        setPlaceSaveError(getPlaceSaveErrorMessage(error));
        setSavingPlaceListId(null);
        return;
      }

      const result = Array.isArray(data) ? data[0] : data;
      const saved =
        typeof result?.IsSaved === "boolean" ? result.IsSaved : shouldSave;
      const nextPlaceCount = Number(result?.PlaceCount);
      const returnedPlaceId = Number(result?.PlaceId);

      if (Number.isInteger(returnedPlaceId) && returnedPlaceId > 0) {
        setSelectedPlace((currentPlace) =>
          currentPlace
            ? {
                ...currentPlace,
                placeId: currentPlace.placeId || returnedPlaceId,
              }
            : currentPlace
        );
      }

      setPlaceLists((currentLists) =>
        currentLists.map((currentList) =>
          Number(currentList?.UserPlaceListId) === listId
            ? {
                ...currentList,
                IsSaved: saved,
                PlaceCount: Number.isFinite(nextPlaceCount)
                  ? nextPlaceCount
                  : Math.max(0, Number(currentList?.PlaceCount) || 0) +
                    (saved ? 1 : -1),
              }
            : currentList
        )
      );

      setPlaceSaveNotice(
        saved ? "Mekan listene kaydedildi." : "Mekan listeden kaldırıldı."
      );
      setSavingPlaceListId(null);
      setMapPlacesRefreshKey((currentKey) => currentKey + 1);
      onPlaceSaved?.();
    },
    [onPlaceSaved, savingPlaceListId, selectedPlace]
  );

  const handleOpenPlaceDetail = useCallback(() => {
    const placeId =
      Number(selectedPlaceReviewSummary.placeId) ||
      Number(selectedPlace?.placeId) ||
      null;

    if (!placeId || !selectedPlace) {
      return;
    }

    onOpenPlaceDetail?.({
      placeId,
      placeName: selectedPlace.name,
      venueCategoryCode: selectedPlace.venueCategoryCode,
    });
  }, [onOpenPlaceDetail, selectedPlace, selectedPlaceReviewSummary.placeId]);

  const saveNoteDraft = async () => {
    const title = cleanText(noteTitle);
    const content = cleanText(noteDraft);
    const rating = Number(noteRating);
    const visitedDate = cleanText(noteVisitedDate) || null;
    const hasSavedNote =
      Number.isInteger(Number(createdNoteId)) && Number(createdNoteId) > 0;

    if (!selectedPlace || isSavingNote) {
      return;
    }

    if (!hasSavedNote) {
      if (!title) {
        setNoteSaveError(MESSAGE_KEY.NOTE_TITLE_REQUIRED);
        return;
      }

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        setNoteSaveError(MESSAGE_KEY.NOTE_RATING_REQUIRED);
        return;
      }

      if (!content) {
        setNoteSaveError(MESSAGE_KEY.NOTE_DETAIL_REQUIRED);
        return;
      }
    }

    if (hasSavedNote && notePhotoDraftsRef.current.length === 0) {
      return;
    }

    setIsSavingNote(true);
    setNoteSaveError("");

    let placeNoteId = Number(createdNoteId);

    try {
      if (!hasSavedNote) {
        try {
          const createdId = await createPlaceNote(selectedPlace, {
            title,
            content,
            rating,
            visitedDate,
          });

          placeNoteId = Number(createdId);

          if (!Number.isInteger(placeNoteId) || placeNoteId <= 0) {
            throw new Error("Not kaydedildi fakat oluşturulan not bulunamadı.");
          }
        } catch (error) {
          console.error("Not kaydedilemedi:", error);
          setNoteSaveError(getNoteCreateErrorMessage(error));
          return;
        }

        // The note is durable at this point. Keep the modal open only when
        // its optional photo stage still needs attention.
        setCreatedNoteId(placeNoteId);

        try {
          await Promise.resolve(onNoteCreated?.());
        } catch (refreshError) {
          console.warn("Not sonrası ekran verileri yenilenemedi:", refreshError);
        }
      }

      if (notePhotoDraftsRef.current.length > 0) {
        try {
          await uploadMyNotePhotoDrafts(placeNoteId, notePhotoDraftsRef.current);
        } catch (error) {
          console.error("Not kaydedildi ancak fotoğraflar yüklenemedi:", error);
          setNoteSaveError(getPartialPhotoUploadErrorMessage(error));
          return;
        }
      }

      setIsNoteModalOpen(false);
      resetNoteForm();
    } finally {
      setIsSavingNote(false);
    }
  };

  if (!apiKey) {
    return <p>{t(MESSAGE_KEY.MAPS_API_KEY_MISSING)}</p>;
  }

  if (!mapId) {
    return <p>{t(MESSAGE_KEY.MAPS_ID_MISSING)}</p>;
  }

  return (
    <section className="map-page">
      <APIProvider apiKey={apiKey} language="tr" region="TR">
        <div className="map-wrapper">
          <Map
            mapId={mapId}
            defaultCenter={ankaraCenter}
            defaultZoom={15}
            gestureHandling="greedy"
            clickableIcons
            disableDefaultUI={true}
            className="google-map"
          >
            <MapReference mapRef={mapRef} />
            <InitialLocationFocus
              userLocation={userLocation}
              focusLockRef={initialFocusLockRef}
            />
            <ExternalPlaceFocus
              place={focusPlace}
              focusLockRef={initialFocusLockRef}
              onFocus={handleExternalPlaceFocus}
            />
            <PoiPlaceClickHandler onPlaceSelected={handlePlaceSelected} />
            <PlaceSearch onPlaceSelected={handlePlaceSelected} />
            <SocialVenueNotesLayer
              isActive={isActive}
              refreshKey={`${notesRefreshKey}:${mapPlacesRefreshKey}`}
              onPlaceSelected={handlePlaceSelected}
            />
            <UserLocationMarker userLocation={userLocation} />
            <SelectedPlaceMarker selectedPlace={selectedPlace} />
            <MapBottomControls
              userLocation={userLocation}
              locationMessage={locationMessage}
              selectedPlaceCardHeight={selectedPlaceCardHeight}
              hasSelectedPlace={Boolean(selectedPlace)}
            />
          </Map>

          {selectedPlace && (
            <SelectedPlaceCard
              selectedPlace={selectedPlace}
              reviewSummary={selectedPlaceReviewSummary}
              cardRef={selectedPlaceCardRef}
              onTitleClick={goToSelectedPlace}
              onAddNote={openNoteModal}
              onOpenSave={openPlaceSaveSheet}
              onOpenDetail={handleOpenPlaceDetail}
              onClose={clearSelectedPlace}
            />
          )}
        </div>

        {isNoteModalOpen &&
          selectedPlace &&
          createPortal(
            <AddNoteModal
              placeName={selectedPlace.name}
              noteTitle={noteTitle}
              noteDraft={noteDraft}
              noteRating={noteRating}
              noteVisitedDate={noteVisitedDate}
              notePhotoDrafts={notePhotoDrafts}
              noteHasBeenSaved={Boolean(createdNoteId)}
              isSaving={isSavingNote}
              saveError={noteSaveError}
              onTitleChange={handleNoteTitleChange}
              onNoteChange={handleNoteDraftChange}
              onRatingChange={handleNoteRatingChange}
              onVisitedDateChange={handleNoteVisitedDateChange}
              onPhotosSelected={handleNotePhotosSelected}
              onRemovePhoto={handleRemoveNotePhotoDraft}
              onCancel={closeNoteModal}
              onSave={saveNoteDraft}
            />,
            document.body
          )}

        {isPlaceSaveSheetOpen &&
          selectedPlace &&
          createPortal(
            <PlaceSaveSheet
              placeName={selectedPlace.name}
              lists={placeLists}
              isLoading={placeListsLoading}
              savingListId={savingPlaceListId}
              errorMessage={placeSaveError}
              notice={placeSaveNotice}
              onClose={closePlaceSaveSheet}
              onToggleList={togglePlaceInList}
              onRetry={openPlaceSaveSheet}
            />,
            document.body
          )}
      </APIProvider>
    </section>
  );
}
