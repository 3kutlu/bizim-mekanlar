#!/usr/bin/env node

/**
 * One-time Google primary type backfill for Bizim Mekanlar.
 *
 * Reads every Place with a GooglePlaceId, calls Place Details (New) with the
 * smallest possible field mask (`primaryType`), maps that sole value to the
 * app category, and updates Places.
 *
 * The script defaults to a dry run. Add --apply to write to Supabase.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VENUE_CATEGORY_CODE,
  getVenueCategoryFromGooglePrimaryType,
} from "../src/utils/venueCategory.js";

const PAGE_SIZE = 250;
const GOOGLE_REQUEST_DELAY_MS = 120;
const args = new Set(process.argv.slice(2));
const applyChanges = args.has("--apply");
const requestedLimit = getNumericArgument("--limit");

loadEnvFile(".env.local");
loadEnvFile(".env.backfill.local");

const supabaseUrl = requiredEnv("VITE_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const googleApiKey =
  process.env.GOOGLE_PLACES_API_KEY?.trim() ||
  process.env.VITE_GOOGLE_MAPS_API_KEY?.trim();

if (!googleApiKey) {
  fail(
    "GOOGLE_PLACES_API_KEY veya VITE_GOOGLE_MAPS_API_KEY bulunamadı. " +
      "Geçici .env.backfill.local dosyana Google Places API (New) anahtarını ekle."
  );
}

const report = {
  total: 0,
  processed: 0,
  changed: 0,
  unchanged: 0,
  unsupportedPrimaryType: 0,
  missingPrimaryType: 0,
  googleErrors: 0,
  databaseErrors: 0,
};

console.log(
  applyChanges
    ? "\nGoogle primary type backfill BAŞLADI (apply modu).\n"
    : "\nGoogle primary type backfill DRY RUN modunda. Veritabanına yazılmaz.\n"
);

const places = await loadAllPlaces();
report.total = places.length;

if (places.length === 0) {
  console.log("GooglePlaceId bulunan mekan yok. İşlem yapılmadı.");
  process.exit(0);
}

const limitedPlaces = Number.isFinite(requestedLimit)
  ? places.slice(0, requestedLimit)
  : places;

for (const [index, place] of limitedPlaces.entries()) {
  const prefix = `[${index + 1}/${limitedPlaces.length}]`;
  const name = String(place.Name ?? "İsimsiz mekan").trim();
  const placeId = Number(place.PlaceId);
  const googlePlaceId = String(place.GooglePlaceId ?? "").trim();

  if (!Number.isInteger(placeId) || !googlePlaceId) {
    console.warn(`${prefix} Atlandı: eksik PlaceId veya GooglePlaceId (${name}).`);
    continue;
  }

  try {
    const googlePrimaryType = await fetchGooglePrimaryType(googlePlaceId);

    if (!googlePrimaryType) {
      report.missingPrimaryType += 1;
      console.warn(`${prefix} ${name}: Google primaryType döndürmedi, mevcut kayıt korunuyor.`);
      await sleep(GOOGLE_REQUEST_DELAY_MS);
      continue;
    }

    const categoryCode = getVenueCategoryFromGooglePrimaryType(googlePrimaryType);
    const databaseCategoryCode =
      categoryCode === VENUE_CATEGORY_CODE.OTHER ? null : categoryCode;
    const currentPrimaryType = normalizeNullable(place.GooglePrimaryType);
    const currentCategoryCode = normalizeNullable(place.VenueCategoryCode);

    if (databaseCategoryCode === null) {
      report.unsupportedPrimaryType += 1;
    }

    const isAlreadyCurrent =
      currentPrimaryType === googlePrimaryType &&
      currentCategoryCode === databaseCategoryCode;

    if (isAlreadyCurrent) {
      report.unchanged += 1;
      console.log(
        `${prefix} ${name}: değişiklik yok (${googlePrimaryType} → ${databaseCategoryCode ?? "OTHER"}).`
      );
      await sleep(GOOGLE_REQUEST_DELAY_MS);
      continue;
    }

    console.log(
      `${prefix} ${name}: ${currentCategoryCode ?? "null"} → ${databaseCategoryCode ?? "null"} ` +
        `(${googlePrimaryType}).`
    );

    if (applyChanges) {
      try {
        await updatePlace(placeId, {
          GooglePrimaryType: googlePrimaryType,
          GooglePrimaryTypeSyncedAt: new Date().toISOString(),
          VenueCategoryCode: databaseCategoryCode,
        });
      } catch (error) {
        report.databaseErrors += 1;
        console.error(`${prefix} ${name}: Supabase güncellemesi başarısız.`, error.message);
        await sleep(GOOGLE_REQUEST_DELAY_MS);
        continue;
      }
    }

    report.changed += 1;
  } catch (error) {
    report.googleErrors += 1;
    console.error(`${prefix} ${name}: Google Place Details çağrısı başarısız.`, error.message);
  }

  report.processed += 1;
  await sleep(GOOGLE_REQUEST_DELAY_MS);
}

console.log("\n--- Backfill raporu ---");
console.table({
  "Bulunan mekan": report.total,
  "İşlenen mekan": report.processed,
  "Güncellenen / güncellenecek": report.changed,
  "Zaten güncel": report.unchanged,
  "Destek dışı primary type": report.unsupportedPrimaryType,
  "Primary type dönmeyen": report.missingPrimaryType,
  "Google hatası": report.googleErrors,
  "Supabase güncelleme hatası": report.databaseErrors,
});

if (!applyChanges) {
  console.log("\nDry run tamamlandı. Yazmak için aynı komutu --apply ile tekrar çalıştır.");
}

function getNumericArgument(name) {
  const raw = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (!raw) {
    return null;
  }

  const value = Number(raw.slice(name.length + 1));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function loadEnvFile(fileName) {
  const fullPath = resolve(process.cwd(), fileName);

  if (!existsSync(fullPath)) {
    return;
  }

  const content = readFileSync(fullPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    fail(`${name} bulunamadı. .env.local veya .env.backfill.local dosyasını kontrol et.`);
  }

  return value;
}

async function loadAllPlaces() {
  const rows = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const end = start + PAGE_SIZE - 1;
    const params = new URLSearchParams({
      select: "PlaceId,Name,GooglePlaceId,VenueCategoryCode,GooglePrimaryType",
      GooglePlaceId: "not.is.null",
      order: "PlaceId.asc",
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/Places?${params.toString()}`, {
      headers: supabaseHeaders({
        Range: `${start}-${end}`,
        "Range-Unit": "items",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      fail(`Places okunamadı (${response.status}): ${body}`);
    }

    const page = await response.json();

    if (!Array.isArray(page)) {
      fail("Places endpointi beklenen dizi formatında dönmedi.");
    }

    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function fetchGooglePrimaryType(googlePlaceId) {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}`,
    {
      headers: {
        "X-Goog-Api-Key": googleApiKey,
        "X-Goog-FieldMask": "primaryType",
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${body}`);
  }

  const data = await response.json();
  return normalizeNullable(data?.primaryType);
}

async function updatePlace(placeId, patch) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/Places?PlaceId=eq.${encodeURIComponent(String(placeId))}`,
    {
      method: "PATCH",
      headers: supabaseHeaders({
        Prefer: "return=minimal",
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(patch),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${body}`);
  }
}

function supabaseHeaders(extraHeaders = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extraHeaders,
  };
}

function normalizeNullable(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

function fail(message) {
  console.error(`\nHATA: ${message}\n`);
  process.exit(1);
}
