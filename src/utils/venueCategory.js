export const VENUE_CATEGORY_CODE = Object.freeze({
  CAFE_BAKERY: "CAFE_BAKERY",
  RESTAURANT: "RESTAURANT",
  BAR_NIGHTLIFE: "BAR_NIGHTLIFE",
  FITNESS: "FITNESS",
  CULTURE_ACTIVITY: "CULTURE_ACTIVITY",
  OTHER: "OTHER",
});

const CATEGORY_META = Object.freeze({
  [VENUE_CATEGORY_CODE.CAFE_BAKERY]: {
    icon: "☕",
    label: "Kafe ve pastane",
  },
  [VENUE_CATEGORY_CODE.RESTAURANT]: {
    icon: "🍽️",
    label: "Restoran",
  },
  [VENUE_CATEGORY_CODE.BAR_NIGHTLIFE]: {
    icon: "🍸",
    label: "Bar ve gece hayatı",
  },
  [VENUE_CATEGORY_CODE.FITNESS]: {
    icon: "💪",
    label: "Spor ve fitness",
  },
  [VENUE_CATEGORY_CODE.CULTURE_ACTIVITY]: {
    icon: "🎭",
    label: "Kültür ve aktivite",
  },
  [VENUE_CATEGORY_CODE.OTHER]: {
    icon: "📍",
    label: "Mekan",
  },
});

const TYPE_SETS = Object.freeze({
  [VENUE_CATEGORY_CODE.CAFE_BAKERY]: new Set([
    "cafe",
    "coffee_shop",
    "bakery",
    "pastry_shop",
    "dessert_restaurant",
    "dessert_shop",
    "ice_cream_shop",
    "juice_shop",
    "tea_house",
    "chocolate_shop",
  ]),
  [VENUE_CATEGORY_CODE.BAR_NIGHTLIFE]: new Set([
    "bar",
    "pub",
    "night_club",
    "wine_bar",
    "cocktail_bar",
    "live_music_venue",
  ]),
  [VENUE_CATEGORY_CODE.RESTAURANT]: new Set([
    "restaurant",
    "fast_food_restaurant",
    "breakfast_restaurant",
    "brunch_restaurant",
    "hamburger_restaurant",
    "pizza_restaurant",
    "sandwich_shop",
    "seafood_restaurant",
    "steak_house",
    "sushi_restaurant",
    "turkish_restaurant",
    "kebab_shop",
    "meal_takeaway",
    "food_court",
  ]),
  [VENUE_CATEGORY_CODE.FITNESS]: new Set([
    "gym",
    "fitness_center",
    "yoga_studio",
    "sports_club",
    "pilates_studio",
  ]),
  [VENUE_CATEGORY_CODE.CULTURE_ACTIVITY]: new Set([
    "movie_theater",
    "museum",
    "art_museum",
    "history_museum",
    "art_gallery",
    "art_studio",
    "performing_arts_theater",
    "concert_hall",
    "opera_house",
    "philharmonic_hall",
    "auditorium",
    "amphitheatre",
    "cultural_center",
    "cultural_landmark",
    "historical_place",
    "historical_landmark",
    "monument",
    "castle",
    "sculpture",
    "tourist_attraction",
    "visitor_center",
    "national_park",
    "state_park",
    "botanical_garden",
    "planetarium",
    "bowling_alley",
    "amusement_center",
    "amusement_park",
    "video_arcade",
  ]),
});

function normalizeType(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function getVenueCategoryMeta(categoryCode) {
  return CATEGORY_META[categoryCode] || CATEGORY_META[VENUE_CATEGORY_CODE.OTHER];
}

export function getVenueCategoryIcon(categoryCode) {
  return getVenueCategoryMeta(categoryCode).icon;
}

export function getVenueCategoryLabel(categoryCode) {
  return getVenueCategoryMeta(categoryCode).label;
}

export function isSupportedVenueCategory(categoryCode) {
  return (
    Object.prototype.hasOwnProperty.call(CATEGORY_META, categoryCode) &&
    categoryCode !== VENUE_CATEGORY_CODE.OTHER
  );
}

export function getVenueCategoryFromGooglePlace(place) {
  const types = new Set(
    [place?.primaryType, ...(Array.isArray(place?.types) ? place.types : [])]
      .map(normalizeType)
      .filter(Boolean)
  );

  for (const categoryCode of [
    VENUE_CATEGORY_CODE.CAFE_BAKERY,
    VENUE_CATEGORY_CODE.BAR_NIGHTLIFE,
    VENUE_CATEGORY_CODE.RESTAURANT,
    VENUE_CATEGORY_CODE.FITNESS,
    VENUE_CATEGORY_CODE.CULTURE_ACTIVITY,
  ]) {
    const allowedTypes = TYPE_SETS[categoryCode];

    if ([...types].some((type) => allowedTypes.has(type))) {
      return categoryCode;
    }
  }

  return VENUE_CATEGORY_CODE.OTHER;
}
