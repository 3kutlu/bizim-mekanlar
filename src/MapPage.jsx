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
import "./css/map-page.css";

const ankaraCenter = {
  lat: 39.9334,
  lng: 32.8597,
};

const cleanText = (value) => String(value ?? "").trim();

function MapPage() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;

  const [userLocation, setUserLocation] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");

  const locationMessageTimerRef = useRef(null);
  const hasShownLocationIssueRef = useRef(false);

  const selectedPlaceCardRef = useRef(null);
  const [selectedPlaceCardHeight, setSelectedPlaceCardHeight] = useState(0);

  const mapRef = useRef(null);

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
      showInitialLocationIssue(
        "Tarayıcın konum özelliğini desteklemiyor."
      );

      return () => {
        clearLocationMessage();
      };
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
  }, []);

  const goToSelectedPlace = useCallback(() => {
    if (!mapRef.current || !selectedPlace?.location) {
      return;
    }

    mapRef.current.panTo(selectedPlace.location);
    mapRef.current.setZoom(17);
  }, [selectedPlace]);

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

            <InitialLocationFocus userLocation={userLocation} />

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
            />
          )}
        </div>
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

function InitialLocationFocus({ userLocation }) {
  const map = useMap();
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    if (!map || !userLocation || hasFocusedRef.current) {
      return;
    }

    map.panTo(userLocation);
    map.setZoom(16);

    hasFocusedRef.current = true;
  }, [map, userLocation]);

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

    return () => {
      window.clearTimeout(timer);
    };
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
          "location",
          "viewport",
          "id",
        ],
      });

      if (!place.location || !map) {
        console.warn("Seçilen mekanın konumu bulunamadı.", place);
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

      sessionTokenRef.current =
        new placesLibrary.AutocompleteSessionToken();
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

function SelectedPlaceCard({ selectedPlace, cardRef, onTitleClick }) {
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

        {selectedPlace.address && (
          <span>{selectedPlace.address}</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          console.log("Seçilen mekan:", selectedPlace);
        }}
      >
        Bu mekana not ekle
      </button>
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