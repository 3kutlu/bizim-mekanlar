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
  useRef,
  useState,
} from "react";
import { supabase } from "../supabase.js";
import "../css/map-page.css";
import { createPortal } from "react-dom";

const ankaraCenter = {
  lat: 39.9334,
  lng: 32.8597,
};

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

async function createPlaceNote(selectedPlace, note) {
  const googlePlaceId = cleanText(selectedPlace?.id);
  const name = cleanText(selectedPlace?.name);
  const formattedAddress = cleanText(selectedPlace?.address);
  const cityName = cleanText(selectedPlace?.cityName);
  const latitude = Number(selectedPlace?.location?.lat);
  const longitude = Number(selectedPlace?.location?.lng);

  if (!googlePlaceId || !name || !formattedAddress || !cityName) {
    throw new Error(
      "Mekanın Google'dan gelen adı, adresi veya şehir bilgisi eksik. Lütfen listeden tekrar seç."
    );
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Mekanın konum bilgisi geçersiz.");
  }

  const { data, error } = await supabase.rpc("CreatePlaceNote", {
    p_google_place_id: googlePlaceId,
    p_name: name,
    p_formatted_address: formattedAddress,
    p_postal_code: cleanText(selectedPlace?.postalCode) || null,
    p_city_name: cityName,
    p_latitude: latitude,
    p_longitude: longitude,
    p_content: note,
  });

  if (error) {
    throw error;
  }

  return data;
}

function MapPage({ onNoteCreated, focusPlace, onFocusHandled }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;

  const [userLocation, setUserLocation] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSaveError, setNoteSaveError] = useState("");

  const locationMessageTimerRef = useRef(null);
  const hasShownLocationIssueRef = useRef(false);

  const selectedPlaceCardRef = useRef(null);
  const [selectedPlaceCardHeight, setSelectedPlaceCardHeight] = useState(0);

  const mapRef = useRef(null);
  const initialFocusLockRef = useRef(false);

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
      showInitialLocationIssue("Tarayıcın konum özelliğini desteklemiyor.");

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
        const messages = {
          1: "Konum izni verilmedi.",
          2: "Konum bilgisi alınamadı.",
          3: "Konum isteği zaman aşımına uğradı.",
        };

        showInitialLocationIssue(
          messages[error.code] || "Konum bilgisi alınamadı."
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
      setSelectedPlaceCardHeight(
        Math.ceil(card.getBoundingClientRect().height)
      );
    };

    updateCardHeight();

    const observer = new ResizeObserver(updateCardHeight);
    observer.observe(card);

    return () => observer.disconnect();
  }, [selectedPlace]);

  const handlePlaceSelected = useCallback((place) => {
    setSelectedPlace(place);
    setIsNoteModalOpen(false);
    setNoteDraft("");
    setNoteSaveError("");
  }, []);

  const handleExternalPlaceFocus = useCallback(
    (place) => {
      setSelectedPlace(place);
      setIsNoteModalOpen(false);
      setNoteDraft("");
      setNoteSaveError("");
      onFocusHandled?.();
    },
    [onFocusHandled]
  );

  const goToSelectedPlace = useCallback(() => {
    if (!mapRef.current || !selectedPlace?.location) {
      return;
    }

    mapRef.current.panTo(selectedPlace.location);
    mapRef.current.setZoom(17);
  }, [selectedPlace]);

  const openNoteModal = () => {
    if (!selectedPlace) {
      return;
    }

    setNoteDraft("");
    setNoteSaveError("");
    setIsNoteModalOpen(true);
  };

  const closeNoteModal = () => {
    if (isSavingNote) {
      return;
    }

    setIsNoteModalOpen(false);
    setNoteDraft("");
    setNoteSaveError("");
  };

  const saveNoteDraft = async () => {
    const note = cleanText(noteDraft);

    if (!note || !selectedPlace || isSavingNote) {
      return;
    }

    setIsSavingNote(true);
    setNoteSaveError("");

    try {
      const placeNoteId = await createPlaceNote(selectedPlace, note);

      console.log("Not Supabase'e kaydedildi:", {
        placeNoteId,
        place: selectedPlace,
        note,
      });

      setIsNoteModalOpen(false);
      setNoteDraft("");

      Promise.resolve(onNoteCreated?.()).catch((error) => {
        console.error("Profil istatistikleri yenilenemedi:", error);
      });
    } catch (error) {
      console.error("Not kaydedilirken hata oluştu:", error);
      setNoteSaveError(
        error?.message || "Not kaydedilemedi. Lütfen tekrar dene."
      );
    } finally {
      setIsSavingNote(false);
    }
  };

  if (!apiKey) {
    return <p>Google Maps API key bulunamadı.</p>;
  }

  if (!mapId) {
    return <p>Google Maps Map ID bulunamadı.</p>;
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
            clickableIcons={false}
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
            <PlaceSearch onPlaceSelected={handlePlaceSelected} />
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
              cardRef={selectedPlaceCardRef}
              onTitleClick={goToSelectedPlace}
              onAddNote={openNoteModal}
            />
          )}
        </div>

      {isNoteModalOpen &&
        selectedPlace &&
        createPortal(
          <AddNoteModal
            placeName={selectedPlace.name}
            noteDraft={noteDraft}
            isSaving={isSavingNote}
            saveError={noteSaveError}
            onNoteChange={setNoteDraft}
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
  const handledRequestRef = useRef(null);

  useEffect(() => {
    if (!map || !place?.requestId || !place?.location) {
      return;
    }

    if (handledRequestRef.current === place.requestId) {
      return;
    }

    const latitude = Number(place.location.lat);
    const longitude = Number(place.location.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    handledRequestRef.current = place.requestId;
    focusLockRef.current = true;

    map.panTo({ lat: latitude, lng: longitude });
    map.setZoom(17);

    onFocus({
      id: cleanText(place.id),
      name: cleanText(place.name) || "İsimsiz mekan",
      address: cleanText(place.address),
      cityName: cleanText(place.cityName),
      postalCode: cleanText(place.postalCode),
      location: {
        lat: latitude,
        lng: longitude,
      },
    });
  }, [focusLockRef, map, onFocus, place]);

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
  if (!selectedPlace?.location) {
    return null;
  }

  return (
    <AdvancedMarker
      position={selectedPlace.location}
      anchorLeft="-50%"
      anchorTop="-50%"
      zIndex={60}
      clickable={false}
      title={`Seçilen mekan: ${selectedPlace.name}`}
    >
      <div className="selected-place-marker" aria-hidden="true">
        🚩
      </div>
    </AdvancedMarker>
  );
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
          sessionTokenRef.current =
            new placesLibrary.AutocompleteSessionToken();
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
        setErrorMessage("Arama sonuçları alınamadı.");
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
        ],
      });

      if (!place.location || !map) {
        return;
      }

      const location = {
        lat: place.location.lat(),
        lng: place.location.lng(),
      };

      const selectedPlace = {
        id: cleanText(place.id),
        name: cleanText(place.displayName) || "İsimsiz mekan",
        address: cleanText(place.formattedAddress),
        cityName: getAddressComponentText(
          place.addressComponents,
          "administrative_area_level_1",
          "locality"
        ),
        postalCode: getAddressComponentText(
          place.addressComponents,
          "postal_code"
        ),
        location,
      };

      if (place.viewport) {
        map.fitBounds(place.viewport);
      } else {
        map.panTo(location);
        map.setZoom(17);
      }

      setQuery(selectedPlace.name);
      setSuggestions([]);
      onPlaceSelected(selectedPlace);
      sessionTokenRef.current = new placesLibrary.AutocompleteSessionToken();
    } catch (error) {
      console.error("Mekan seçilirken hata oluştu:", error);
      setErrorMessage("Mekan seçilemedi.");
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
          {isLoading && (
            <div className="place-search-status">Aranıyor...</div>
          )}

          {!isLoading &&
            suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="place-search-result"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(suggestion)}
              >
                <span className="place-search-result-title">
                  {suggestion.title}
                </span>

                {suggestion.subtitle && (
                  <span className="place-search-result-subtitle">
                    {suggestion.subtitle}
                  </span>
                )}
              </button>
            ))}

          {errorMessage && !isLoading && (
            <div className="place-search-status place-search-error">
              {errorMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SelectedPlaceCard({
  selectedPlace,
  cardRef,
  onTitleClick,
  onAddNote,
}) {
  const handleTitleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onTitleClick();
    }
  };

  return (
    <div ref={cardRef} className="selected-place-card">
      <div className="selected-place-copy">
        <strong
          className="selected-place-title"
          role="button"
          tabIndex={0}
          title="Mekanı haritada göster"
          onClick={onTitleClick}
          onKeyDown={handleTitleKeyDown}
        >
          {selectedPlace.name}
        </strong>

        {selectedPlace.address && <span>{selectedPlace.address}</span>}
      </div>

      <button type="button" onClick={onAddNote}>
        Bu mekana not ekle
      </button>
    </div>
  );
}

function AddNoteModal({
  placeName,
  noteDraft,
  isSaving,
  saveError,
  onNoteChange,
  onCancel,
  onSave,
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();

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

  const canSave = Boolean(cleanText(noteDraft));

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
        <h2 id="note-modal-title">{placeName}</h2>

        <textarea
          ref={textareaRef}
          className="note-modal-textarea"
          value={noteDraft}
          disabled={isSaving}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Bu mekan hakkında ne düşünüyorsun?"
          aria-label="Mekan notu"
          maxLength={1000}
        />

        {saveError && (
          <p
            role="alert"
            style={{
              margin: "-8px 0 0",
              color: "#ffb4b4",
              fontSize: "13px",
              lineHeight: 1.4,
            }}
          >
            {saveError}
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
            className="note-modal-save"
            disabled={!canSave || isSaving}
            onClick={onSave}
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
          {locationMessage}
        </div>
      )}

      <button
        type="button"
        className="location-button"
        aria-label="Konumuma git"
        title={
          userLocation
            ? "Konumuma git"
            : "Konum bilgisi henüz alınamadı"
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
