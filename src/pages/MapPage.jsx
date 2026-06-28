import {
  AdvancedMarker,
  APIProvider,
  Circle,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabase.js";
import {
  createAppError,
  getErrorMessageKey,
  MESSAGE_KEY,
  t,
} from "../i18n/messages.js";
import {
  getVenueCategoryFromGooglePlace,
  getVenueCategoryIcon,
  getVenueCategoryLabel,
  isSupportedVenueCategory,
} from "../utils/venueCategory.js";
import "../css/map-page.css";

const ankaraCenter = {
  lat: 39.9334,
  lng: 32.8597,
};

const MAP_NOTE_LIMIT = 700;
const CLUSTER_PIXEL_RADIUS_BY_ZOOM = [
  { maxZoom: 5, radius: 72 },
  { maxZoom: 8, radius: 62 },
  { maxZoom: 11, radius: 52 },
  { maxZoom: Infinity, radius: 42 },
];

const cleanText = (value) => String(value ?? "").trim();

function getAddressComponentText(addressComponents, ...types) {
  if (!Array.isArray(addressComponents)) {
    return "";
  }

  for (const type of types) {
    const component = addressComponents.find((item) =>
      Array.isArray(item?.types) && item.types.includes(type)
    );

    const value = cleanText(component?.longText || component?.shortText);

    if (value) {
      return value;
    }
  }

  return "";
}

function formatReviewLinkLabel(count) {
  const normalizedCount = Math.max(0, Number(count) || 0);

  if (normalizedCount > 9) {
    return "9+ yorumu gör";
  }

  return `${normalizedCount} yorumu gör`;
}

function getPlaceEligibility(place) {
  return place?.isEligible !== false && isSupportedVenueCategory(place?.venueCategoryCode);
}

function getPointDistance(left, right) {
  const deltaX = left.x - right.x;
  const deltaY = left.y - right.y;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function toWorldPixelPoint(latitude, longitude, zoom) {
  const worldSize = 256 * 2 ** zoom;
  const normalizedLongitude = (Number(longitude) + 180) / 360;
  const latitudeRadians = (Number(latitude) * Math.PI) / 180;
  const mercator = Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2));
  const normalizedLatitude = (1 - mercator / Math.PI) / 2;

  return {
    x: normalizedLongitude * worldSize,
    y: normalizedLatitude * worldSize,
  };
}

function getClusterRadius(zoom) {
  const match = CLUSTER_PIXEL_RADIUS_BY_ZOOM.find(
    (item) => zoom <= item.maxZoom
  );

  return match?.radius ?? 48;
}

function buildMapClusters(places, zoom) {
  const clusterRadius = getClusterRadius(zoom);
  const clusters = [];

  for (const place of places) {
    const latitude = Number(place?.Latitude);
    const longitude = Number(place?.Longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    const worldPoint = toWorldPixelPoint(latitude, longitude, zoom);
    let targetCluster = null;

    for (const cluster of clusters) {
      const distance = getPointDistance(worldPoint, cluster.worldCenter);

      if (distance <= clusterRadius) {
        targetCluster = cluster;
        break;
      }
    }

    if (!targetCluster) {
      clusters.push({
        places: [place],
        latitudeTotal: latitude,
        longitudeTotal: longitude,
        worldCenter: worldPoint,
      });
      continue;
    }

    targetCluster.places.push(place);
    targetCluster.latitudeTotal += latitude;
    targetCluster.longitudeTotal += longitude;

    const count = targetCluster.places.length;
    const latitudeCenter = targetCluster.latitudeTotal / count;
    const longitudeCenter = targetCluster.longitudeTotal / count;

    targetCluster.worldCenter = toWorldPixelPoint(
      latitudeCenter,
      longitudeCenter,
      zoom
    );
  }

  return clusters.map((cluster, index) => {
    const count = cluster.places.length;

    return {
      id: cluster.places
        .map((place) => place.PlaceId)
        .sort((left, right) => Number(left) - Number(right))
        .join("-"),
      index,
      places: cluster.places,
      position: {
        lat: cluster.latitudeTotal / count,
        lng: cluster.longitudeTotal / count,
      },
      isCluster: count > 1,
    };
  });
}

function getSelectedPlaceFromGooglePlace(place) {
  const location = place?.location;
  const latitude = location?.lat?.();
  const longitude = location?.lng?.();
  const venueCategoryCode = getVenueCategoryFromGooglePlace(place);

  return {
    id: cleanText(place?.id),
    name: cleanText(place?.displayName) || "İsimsiz mekan",
    address: cleanText(place?.formattedAddress),
    cityName: getAddressComponentText(
      place?.addressComponents,
      "administrative_area_level_1",
      "locality"
    ),
    postalCode: getAddressComponentText(place?.addressComponents, "postal_code"),
    venueCategoryCode,
    isEligible: isSupportedVenueCategory(venueCategoryCode),
    location: {
      lat: latitude,
      lng: longitude,
    },
  };
}

function getSelectedPlaceFromMapRow(place) {
  return {
    placeId: Number(place?.PlaceId) || null,
    id: cleanText(place?.GooglePlaceId),
    name: cleanText(place?.Name) || "İsimsiz mekan",
    address: cleanText(place?.FormattedAddress),
    cityName: cleanText(place?.CityName),
    postalCode: cleanText(place?.PostalCode),
    venueCategoryCode: cleanText(place?.VenueCategoryCode) || null,
    isEligible: true,
    reviewCount: Math.max(0, Number(place?.VisibleNoteCount) || 0),
    selectionSource: "social-map-marker",
    location: {
      lat: Number(place?.Latitude),
      lng: Number(place?.Longitude),
    },
  };
}

async function createPlaceNote(selectedPlace, { title, content, rating }) {
  const googlePlaceId = cleanText(selectedPlace?.id);
  const name = cleanText(selectedPlace?.name);
  const formattedAddress = cleanText(selectedPlace?.address);
  const cityName = cleanText(selectedPlace?.cityName);
  const latitude = Number(selectedPlace?.location?.lat);
  const longitude = Number(selectedPlace?.location?.lng);

  if (!googlePlaceId || !name || !formattedAddress || !cityName) {
    throw createAppError(MESSAGE_KEY.PLACE_DATA_INCOMPLETE);
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw createAppError(MESSAGE_KEY.PLACE_LOCATION_INVALID);
  }

  const { data, error } = await supabase.rpc("CreatePlaceNoteWithReviewV2", {
    p_google_place_id: googlePlaceId,
    p_name: name,
    p_formatted_address: formattedAddress,
    p_postal_code: cleanText(selectedPlace?.postalCode) || null,
    p_city_name: cityName,
    p_latitude: latitude,
    p_longitude: longitude,
    p_title: title,
    p_content: content,
    p_rating: rating,
    p_venue_category_code: cleanText(selectedPlace?.venueCategoryCode) || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

function MapPage({
  onNoteCreated,
  focusPlace,
  onFocusHandled,
  notesRefreshKey,
  isActive,
  onOpenPlaceReviews,
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;

  const [userLocation, setUserLocation] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [selectedPlaceReviewSummary, setSelectedPlaceReviewSummary] = useState({
    count: 0,
    placeId: null,
    isLoading: false,
  });
  const [locationMessage, setLocationMessage] = useState("");

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteRating, setNoteRating] = useState(0);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSaveError, setNoteSaveError] = useState("");

  const locationMessageTimerRef = useRef(null);
  const hasShownLocationIssueRef = useRef(false);
  const selectedPlaceCardRef = useRef(null);
  const [selectedPlaceCardHeight, setSelectedPlaceCardHeight] = useState(0);
  const mapRef = useRef(null);
  const initialFocusLockRef = useRef(false);
  const selectedPlaceRequestRef = useRef(0);

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
      });
      return;
    }

    const requestId = ++selectedPlaceRequestRef.current;
    const fallbackCount = Math.max(0, Number(selectedPlace.reviewCount) || 0);

    setSelectedPlaceReviewSummary({
      count: fallbackCount,
      placeId: Number(selectedPlace.placeId) || null,
      isLoading: true,
    });

    const loadReviewSummary = async () => {
      const { data, error } = await supabase.rpc(
        "GetPlaceVisibleReviewSummary",
        {
          p_google_place_id: selectedPlace.id,
        }
      );

      if (requestId !== selectedPlaceRequestRef.current) {
        return;
      }

      if (error) {
        console.error("Mekan yorum özeti alınamadı:", error);
        setSelectedPlaceReviewSummary((current) => ({
          ...current,
          isLoading: false,
        }));
        return;
      }

      const summary = Array.isArray(data) ? data[0] : data;
      setSelectedPlaceReviewSummary({
        count: Math.max(0, Number(summary?.VisibleReviewCount) || 0),
        placeId: Number(summary?.PlaceId) || Number(selectedPlace.placeId) || null,
        isLoading: false,
      });
    };

    void loadReviewSummary();
  }, [notesRefreshKey, selectedPlace?.id, selectedPlace?.placeId, selectedPlace?.reviewCount]);

  const resetNoteForm = useCallback(() => {
    setNoteTitle("");
    setNoteDraft("");
    setNoteRating(0);
    setNoteSaveError("");
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

  const handlePlaceSelected = useCallback(
    (place) => {
      setSelectedPlace(place);
      setIsNoteModalOpen(false);
      resetNoteForm();
    },
    [resetNoteForm]
  );

  const handleExternalPlaceFocus = useCallback(
    (place) => {
      setSelectedPlace(place);
      setIsNoteModalOpen(false);
      resetNoteForm();
      onFocusHandled?.();
    },
    [onFocusHandled, resetNoteForm]
  );

  const clearSelectedPlace = useCallback(() => {
    if (isSavingNote) {
      return;
    }

    selectedPlaceRequestRef.current += 1;
    setIsNoteModalOpen(false);
    resetNoteForm();
    setSelectedPlace(null);
    setSelectedPlaceReviewSummary({
      count: 0,
      placeId: null,
      isLoading: false,
    });
  }, [isSavingNote, resetNoteForm]);

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

  const handleOpenPlaceReviews = useCallback(() => {
    if (!selectedPlaceReviewSummary.placeId || !selectedPlace) {
      return;
    }

    onOpenPlaceReviews?.({
      placeId: selectedPlaceReviewSummary.placeId,
      placeName: selectedPlace.name,
      venueCategoryCode: selectedPlace.venueCategoryCode,
    });
  }, [onOpenPlaceReviews, selectedPlace, selectedPlaceReviewSummary.placeId]);

  const saveNoteDraft = async () => {
    const title = cleanText(noteTitle);
    const content = cleanText(noteDraft);
    const rating = Number(noteRating);

    if (!selectedPlace || isSavingNote) {
      return;
    }

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

    setIsSavingNote(true);
    setNoteSaveError("");

    try {
      await createPlaceNote(selectedPlace, {
        title,
        content,
        rating,
      });

      setIsNoteModalOpen(false);
      resetNoteForm();

      await Promise.resolve(onNoteCreated?.());
    } catch (error) {
      console.error("Not kaydedilirken hata oluştu:", error);
      setNoteSaveError(getErrorMessageKey(error, MESSAGE_KEY.NOTE_SAVE_FAILED));
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
              refreshKey={notesRefreshKey}
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
              onOpenReviews={handleOpenPlaceReviews}
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
              isSaving={isSavingNote}
              saveError={noteSaveError}
              onTitleChange={handleNoteTitleChange}
              onNoteChange={handleNoteDraftChange}
              onRatingChange={handleNoteRatingChange}
              onCancel={closeNoteModal}
              onSave={saveNoteDraft}
            />,
            document.body
          )}
      </APIProvider>
    </section>
  );
}

function MapReference({ mapRef }) {
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

function InitialLocationFocus({ userLocation, focusLockRef }) {
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

function ExternalPlaceFocus({ place, focusLockRef, onFocus }) {
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

function UserLocationMarker({ userLocation }) {
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

function SelectedPlaceMarker({ selectedPlace }) {
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
        🚩
      </div>
    </AdvancedMarker>
  );
}

function SocialVenueNotesLayer({ isActive, refreshKey, onPlaceSelected }) {
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
              title={`${cluster.places.length} mekan notu`}
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

        return (
          <AdvancedMarker
            key={`venue-${place.PlaceId}`}
            position={{
              lat: Number(place.Latitude),
              lng: Number(place.Longitude),
            }}
            anchorLeft="-50%"
            anchorTop="-100%"
            zIndex={65}
            title={`${place.Name} · ${reviewCount} yorum`}
            onClick={() => {
              void openPlace(place);
            }}
          >
            <div className="social-map-venue-marker" aria-hidden="true">
              <span className="social-map-venue-marker-icon">{venueIcon}</span>
              {reviewCount > 1 && (
                <span className="social-map-venue-marker-count">{reviewCount > 9 ? "9+" : reviewCount}</span>
              )}
            </div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}

function PoiPlaceClickHandler({ onPlaceSelected }) {
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

function PlaceSearch({ onPlaceSelected }) {
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

function SelectedPlaceCard({
  selectedPlace,
  reviewSummary,
  cardRef,
  onTitleClick,
  onAddNote,
  onOpenReviews,
  onClose,
}) {
  const canAddNote = getPlaceEligibility(selectedPlace);
  const reviewCount = Math.max(0, Number(reviewSummary?.count) || 0);
  const venueIcon = getVenueCategoryIcon(selectedPlace?.venueCategoryCode);
  const venueLabel = getVenueCategoryLabel(selectedPlace?.venueCategoryCode);

  const handleTitleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onTitleClick();
    }
  };

  return (
    <div ref={cardRef} className="selected-place-card">
      <button
        type="button"
        className="selected-place-close"
        onClick={onClose}
        aria-label="Seçili mekanı kapat"
        title="Mekanı kapat"
      >
        ×
      </button>

      <div className="selected-place-copy">
        <strong
          className="selected-place-title"
          role="button"
          tabIndex={0}
          title="Mekanı haritada göster"
          onClick={onTitleClick}
          onKeyDown={handleTitleKeyDown}
        >
          <span className="venue-category-icon venue-category-icon-map" title={venueLabel}>
            {venueIcon}
          </span>
          {selectedPlace.name}
        </strong>

        {selectedPlace.address && <span>{selectedPlace.address}</span>}
      </div>

      {canAddNote ? (
        <>
          {reviewSummary?.isLoading ? (
            <p className="selected-place-review-status">Yorumlar kontrol ediliyor...</p>
          ) : reviewCount > 0 ? (
            <button
              type="button"
              className="selected-place-review-button"
              onClick={onOpenReviews}
              disabled={!reviewSummary?.placeId}
            >
              {formatReviewLinkLabel(reviewCount)}
            </button>
          ) : (
            <p className="selected-place-review-empty">İlk yorumu sen yap.</p>
          )}

          <button type="button" className="selected-place-add-note" onClick={onAddNote}>
            Bu mekana not ekle
          </button>
        </>
      ) : (
        <p className="selected-place-unsupported">
          Bu uygulamada yalnızca yeme-içme, spor ve kültür/aktivite mekanlarına not ekleyebilirsin.
        </p>
      )}
    </div>
  );
}

function AddNoteModal({
  placeName,
  noteTitle,
  noteDraft,
  noteRating,
  isSaving,
  saveError,
  onTitleChange,
  onNoteChange,
  onRatingChange,
  onCancel,
  onSave,
}) {
  const titleInputRef = useRef(null);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  useEffect(() => {
    titleInputRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

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
    detail: !cleanText(noteDraft),
  };

  const canSave = !validation.title && !validation.rating && !validation.detail;
  const showTitleError = hasAttemptedSave && validation.title;
  const showRatingError = hasAttemptedSave && validation.rating;
  const showDetailError = hasAttemptedSave && validation.detail;

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

        <label className="note-modal-field">
          <span>Başlık</span>
          <input
            ref={titleInputRef}
            className="note-modal-input"
            type="text"
            value={noteTitle}
            disabled={isSaving}
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
                disabled={isSaving}
                onClick={() => onRatingChange(rating)}
              >
                ★
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
          <span>Detay</span>
          <textarea
            className="note-modal-textarea"
            value={noteDraft}
            disabled={isSaving}
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

        {saveError && (
          <p className="note-modal-error" role="alert">
            {t(saveError)}
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
            {isSaving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </section>
    </div>
  );
}

function MapBottomControls({
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
        ◎
      </button>
    </div>
  );
}

export default MapPage;
