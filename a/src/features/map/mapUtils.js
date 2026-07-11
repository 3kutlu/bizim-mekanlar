/*
 * Map feature split into page, widgets and pure helpers.
 * Behavior is intentionally preserved from the pre-refactor screen.
 */

import { MESSAGE_KEY, createAppError } from "../../i18n/messages.js";
import { supabase } from "../../supabase.js";
import { getIstanbulDateInputValue } from "../../utils/dates.js";
import { getVenueCategoryFromGooglePlace, isSupportedVenueCategory } from "../../utils/venueCategory.js";

export const ankaraCenter = {
  lat: 39.9334,
  lng: 32.8597,
};

export const MAP_NOTE_LIMIT = 700;

export const CLUSTER_PIXEL_RADIUS_BY_ZOOM = [
  { maxZoom: 5, radius: 72 },
  { maxZoom: 8, radius: 62 },
  { maxZoom: 11, radius: 52 },
  { maxZoom: Infinity, radius: 42 },
];

export const cleanText = (value) => String(value ?? "").trim();

// Backwards-compatible export used by the map widgets. The function is now
// aligned with the Postgres Europe/Istanbul date validation.
export const getLocalDateInputValue = getIstanbulDateInputValue;

export function isMessageKey(value) {
  return /^[A-Z0-9_]+$/.test(cleanText(value));
}

export function getPartialPhotoUploadErrorMessage(error) {
  const stage = cleanText(error?.stage).toLowerCase();
  const rawMessage = cleanText(error?.message).toLowerCase();

  if (stage === "upload") {
    return "Notun kaydedildi ancak fotoğraf dosyası Storage'a yüklenemedi. Bağlantını kontrol edip bu ekrandan tekrar dene.";
  }

  if (stage === "metadata") {
    return "Notun kaydedildi ancak fotoğraf notuna bağlanamadı. Dosyalar temizlendi; bu ekrandan tekrar deneyebilirsin.";
  }

  if (stage === "cleanup") {
    return "Notun kaydedildi ancak fotoğraf yüklemesi tamamlanamadı. Sayfayı yenileyip notu düzenleyerek fotoğrafı tekrar ekle.";
  }

  if (
    rawMessage.includes("row-level security") ||
    rawMessage.includes("permission denied") ||
    rawMessage.includes("not authorized")
  ) {
    return "Notun kaydedildi ancak fotoğraf yükleme izni doğrulanamadı. Sayfayı yenileyip tekrar dene.";
  }

  if (
    rawMessage.includes("network") ||
    rawMessage.includes("failed to fetch") ||
    rawMessage.includes("fetch failed")
  ) {
    return "Notun kaydedildi ancak fotoğraf yüklemesi bağlantı nedeniyle tamamlanamadı. Bağlantını kontrol edip tekrar dene.";
  }

  if (
    rawMessage.includes("ambiguous") ||
    rawMessage.includes("column reference")
  ) {
    return "Notun kaydedildi ancak fotoğraflar veritabanına eklenemedi. Bu ekrandan tekrar deneyebilirsin.";
  }

  return "Notun kaydedildi ancak fotoğraflar yüklenemedi. Bu ekrandan tekrar deneyebilirsin.";
}

export function getAddressComponentText(addressComponents, ...types) {
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

export function formatReviewLinkLabel(count) {
  const normalizedCount = Math.max(0, Number(count) || 0);

  if (normalizedCount > 9) {
    return "9+ yorumu gör";
  }

  return `${normalizedCount} yorumu gör`;
}

export function formatAverageRating(value) {
  const rating = Number(value);

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return "";
  }

  return rating.toFixed(1);
}

export function getPlaceEligibility(place) {
  return place?.isEligible !== false && isSupportedVenueCategory(place?.venueCategoryCode);
}

export function getPointDistance(left, right) {
  const deltaX = left.x - right.x;
  const deltaY = left.y - right.y;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

export function toWorldPixelPoint(latitude, longitude, zoom) {
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

export function getClusterRadius(zoom) {
  const match = CLUSTER_PIXEL_RADIUS_BY_ZOOM.find(
    (item) => zoom <= item.maxZoom
  );

  return match?.radius ?? 48;
}

export function buildMapClusters(places, zoom) {
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

export function getSelectedPlaceFromGooglePlace(place) {
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

export function getSelectedPlaceFromMapRow(place) {
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

export async function createPlaceNote(
  selectedPlace,
  { title, content, rating, visitedDate }
) {
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

  const { data, error } = await supabase.rpc("CreatePlaceNoteWithReviewV3", {
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
    p_visited_date: cleanText(visitedDate) || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

export function getPlaceSavePayload(selectedPlace) {
  const placeId = Number(selectedPlace?.placeId);
  const googlePlaceId = cleanText(selectedPlace?.id);
  const name = cleanText(selectedPlace?.name);
  const formattedAddress = cleanText(selectedPlace?.address);
  const cityName = cleanText(selectedPlace?.cityName);
  const latitude = Number(selectedPlace?.location?.lat);
  const longitude = Number(selectedPlace?.location?.lng);

  const hasExistingPlaceId = Number.isInteger(placeId) && placeId > 0;

  if (!hasExistingPlaceId) {
    if (!googlePlaceId || !name || !formattedAddress || !cityName) {
      throw createAppError(MESSAGE_KEY.PLACE_DATA_INCOMPLETE);
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw createAppError(MESSAGE_KEY.PLACE_LOCATION_INVALID);
    }
  }

  return {
    p_place_id: hasExistingPlaceId ? placeId : null,
    p_google_place_id: googlePlaceId || null,
    p_name: name || null,
    p_formatted_address: formattedAddress || null,
    p_postal_code: cleanText(selectedPlace?.postalCode) || null,
    p_city_name: cityName || null,
    p_latitude: Number.isFinite(latitude) ? latitude : null,
    p_longitude: Number.isFinite(longitude) ? longitude : null,
    p_venue_category_code: cleanText(selectedPlace?.venueCategoryCode) || null,
  };
}
