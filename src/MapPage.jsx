import { useCallback, useEffect, useRef, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

const ankaraCenter = {
  lat: 39.9334,
  lng: 32.8597,
};

function MapPage() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;

  const [userLocation, setUserLocation] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationMessage("Tarayıcın konum özelliğini desteklemiyor.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });

        setLocationMessage("");
      },
      (error) => {
        const messages = {
          1: "Konum izni verilmedi.",
          2: "Konum bilgisi alınamadı.",
          3: "Konum isteği zaman aşımına uğradı.",
        };

        setLocationMessage(
          messages[error.code] || "Konum alınamadı."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const handlePlaceSelected = useCallback((place) => {
    setSelectedPlace(place);
  }, []);

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
            <MapController userLocation={userLocation} />


            {userLocation && (
            <AdvancedMarker
                position={userLocation}
                zIndex={100}
                anchorLeft="-50%"
                anchorTop="-50%"
            >
                <div className="user-location-dot">
                <div className="user-location-dot-inner" />
                </div>
            </AdvancedMarker>
            )}

            {selectedPlace?.location && (
            <AdvancedMarker
                position={selectedPlace.location}
                zIndex={90}
                anchorLeft="-50%"
                anchorTop="-100%"
            >
                <div className="place-marker">●</div>
            </AdvancedMarker>
            )}

            {selectedPlace?.location && (
              <AdvancedMarker
                position={selectedPlace.location}
                zIndex={90}
                anchorLeft="50%"
                anchorTop="100%"
              >
                <div className="place-marker">●</div>
              </AdvancedMarker>
            )}
          </Map>

          <PlaceSearch onPlaceSelected={handlePlaceSelected} />

          <button
            type="button"
            className="location-button"
            onClick={() => {
              if (!userLocation) return;
              window.dispatchEvent(
                new CustomEvent("center-user-location", {
                  detail: userLocation,
                })
              );
            }}
            aria-label="Konumuma git"
          >
            ◎
          </button>
        </div>
      </APIProvider>

      {selectedPlace && (
        <div className="selected-place-card">
          <strong>{selectedPlace.name}</strong>
          <span>{selectedPlace.address}</span>

          <button
            type="button"
            onClick={() => {
              console.log("Seçilen mekan:", selectedPlace);
            }}
          >
            Bu mekana not ekle
          </button>
        </div>
      )}

      {locationMessage && (
        <div className="location-message">{locationMessage}</div>
      )}
    </section>
  );
}

function MapController({ userLocation }) {
  const map = useMap();
  const hasInitialCentered = useRef(false);

  useEffect(() => {
    if (!map || !userLocation || hasInitialCentered.current) return;

    map.panTo(userLocation);
    map.setZoom(16);

    hasInitialCentered.current = true;
  }, [map, userLocation]);

  useEffect(() => {
    if (!map) return;

    const handleCenterUserLocation = (event) => {
      const location = event.detail;

      if (!location) return;

      map.panTo(location);
      map.setZoom(16);
    };

    window.addEventListener(
      "center-user-location",
      handleCenterUserLocation
    );

    return () => {
      window.removeEventListener(
        "center-user-location",
        handleCenterUserLocation
      );
    };
  }, [map]);

  return null;
}

function PlaceSearch({ onPlaceSelected }) {
  const map = useMap();
  const placesLibrary = useMapsLibrary("places");
  const autocompleteContainerRef = useRef(null);

  useEffect(() => {
    if (!placesLibrary || !autocompleteContainerRef.current) return;

    const autocomplete = new placesLibrary.PlaceAutocompleteElement();

    autocomplete.placeholder = "Mekan ara...";
    autocomplete.includedRegionCodes = ["tr"];

    autocompleteContainerRef.current.replaceChildren(autocomplete);

    const handlePlaceSelect = async (event) => {
      try {
        const prediction = event.placePrediction;

        if (!prediction) return;

        const place = prediction.toPlace();

        await place.fetchFields({
          fields: [
            "displayName",
            "formattedAddress",
            "location",
            "id",
            "viewport",
          ],
        });

        if (!place.location) return;

        const selectedPlace = {
          id: place.id,
          name: place.displayName || "İsimsiz mekan",
          address: place.formattedAddress || "",
          location: {
            lat: place.location.lat(),
            lng: place.location.lng(),
          },
        };

        if (place.viewport) {
          map?.fitBounds(place.viewport);
        } else {
          map?.panTo(selectedPlace.location);
          map?.setZoom(17);
        }

        onPlaceSelected(selectedPlace);
      } catch (error) {
        console.error("Mekan seçilirken hata oluştu:", error);
      }
    };

    autocomplete.addEventListener("gmp-select", handlePlaceSelect);

    return () => {
      autocomplete.removeEventListener("gmp-select", handlePlaceSelect);
      autocomplete.remove();
    };
  }, [placesLibrary, map, onPlaceSelected]);

  return (
    <div
      ref={autocompleteContainerRef}
      className="map-search"
    />
  );
}

export default MapPage;