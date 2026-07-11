import { supabase } from "../supabase.js";
import { compressNotePhotoFile } from "./imageCompression.js";

export const NOTE_PHOTO_BUCKET = "note-photos";
export const MAX_NOTE_PHOTOS = 3;
export const MAX_NOTE_PHOTO_BYTES = 8 * 1024 * 1024;
export const NOTE_PHOTO_UPLOAD_COPY = "8 MB’a kadar, yüklerken küçültülür";
export const ALLOWED_NOTE_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const extensionByMimeType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function cleanText(value) {
  return String(value ?? "").trim();
}

function makeDraftId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSafeExtension(file) {
  const byMimeType = extensionByMimeType[file?.type];

  if (byMimeType) {
    return byMimeType;
  }

  const rawName = cleanText(file?.name);
  const match = rawName.match(/\.([a-z0-9]{1,8})$/i);

  return match ? match[1].toLowerCase() : "jpg";
}

function normalizeFileName(file) {
  const source = cleanText(file?.name) || "fotoğraf";

  return source.slice(0, 255);
}

function createPhotoOperationError(stage, cause, fallbackMessage) {
  const error = new Error(
    String(cause?.message ?? fallbackMessage ?? "Fotoğraf işlemi tamamlanamadı.")
  );

  error.stage = stage;
  error.cause = cause;
  return error;
}

export function getPhotoSelectionError(files, currentCount = 0) {
  const incomingFiles = Array.from(files ?? []);

  if (incomingFiles.length === 0) {
    return "";
  }

  if (Number(currentCount) + incomingFiles.length > MAX_NOTE_PHOTOS) {
    return `Bir nota en fazla ${MAX_NOTE_PHOTOS} fotoğraf ekleyebilirsin.`;
  }

  const invalidType = incomingFiles.find(
    (file) => !ALLOWED_NOTE_PHOTO_TYPES.has(file?.type)
  );

  if (invalidType) {
    return "Yalnızca JPG, PNG veya WEBP formatında fotoğraf ekleyebilirsin.";
  }

  const oversizedFile = incomingFiles.find(
    (file) => Number(file?.size) > MAX_NOTE_PHOTO_BYTES
  );

  if (oversizedFile) {
    return "Her fotoğraf en fazla 8 MB olabilir.";
  }

  return "";
}

export function createNotePhotoDrafts(files) {
  return Array.from(files ?? []).map((file) => ({
    id: makeDraftId(),
    file,
    name: normalizeFileName(file),
    previewUrl: URL.createObjectURL(file),
  }));
}

export function revokeNotePhotoDrafts(drafts) {
  for (const draft of drafts ?? []) {
    if (draft?.previewUrl) {
      URL.revokeObjectURL(draft.previewUrl);
    }
  }
}

export async function createSignedNotePhotoUrls(photoRows, expiresIn = 60 * 60) {
  const rows = Array.isArray(photoRows) ? photoRows : [];
  const paths = rows
    .map((photo) => cleanText(photo?.StoragePath))
    .filter(Boolean);

  if (paths.length === 0) {
    return rows.map((photo) => ({ ...photo, SignedUrl: "" }));
  }

  const { data, error } = await supabase.storage
    .from(NOTE_PHOTO_BUCKET)
    .createSignedUrls(paths, expiresIn);

  if (error) {
    throw error;
  }

  const signedUrlByPath = new Map(
    (data ?? []).map((item) => [item.path, item.signedUrl || ""])
  );

  return rows.map((photo) => ({
    ...photo,
    SignedUrl: signedUrlByPath.get(cleanText(photo?.StoragePath)) || "",
  }));
}

export async function uploadMyNotePhotoDrafts(placeNoteId, drafts) {
  const normalizedNoteId = Number(placeNoteId);
  const photoDrafts = Array.isArray(drafts) ? drafts : [];

  if (!Number.isInteger(normalizedNoteId) || normalizedNoteId <= 0) {
    throw new Error("Fotoğraf eklemek için geçerli bir not bulunamadı.");
  }

  if (photoDrafts.length === 0) {
    return [];
  }

  const validationError = getPhotoSelectionError(photoDrafts.map((draft) => draft.file));

  if (validationError) {
    throw new Error(validationError);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user?.id) {
    throw new Error("Fotoğraf eklemek için oturumun doğrulanamadı.");
  }

  const uploadedPaths = [];
  const metadata = [];

  try {
    for (let index = 0; index < photoDrafts.length; index += 1) {
      const draft = photoDrafts[index];
      const file = draft?.file;

      if (!file) {
        throw new Error("Seçilen fotoğraf okunamadı.");
      }

      const uploadFile = await compressNotePhotoFile(file);
      const extension = getSafeExtension(uploadFile);
      const objectPath = `${user.id}/${normalizedNoteId}/${makeDraftId()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(NOTE_PHOTO_BUCKET)
        .upload(objectPath, uploadFile, {
          cacheControl: "31536000",
          contentType: uploadFile.type,
          upsert: false,
        });

      if (uploadError) {
        throw createPhotoOperationError(
          "upload",
          uploadError,
          "Fotoğraf dosyası Storage'a yüklenemedi."
        );
      }

      uploadedPaths.push(objectPath);
      metadata.push({
        storagePath: objectPath,
        fileName: normalizeFileName(uploadFile),
        mimeType: uploadFile.type,
        byteSize: Number(uploadFile.size) || 0,
        sortOrder: index,
      });
    }

    const { data, error } = await supabase.rpc("CreateMyPlaceNotePhotos", {
      p_place_note_id: normalizedNoteId,
      p_photos: metadata,
    });

    if (error) {
      throw createPhotoOperationError(
        "metadata",
        error,
        "Fotoğraflar nota bağlanamadı."
      );
    }

    return data ?? [];
  } catch (error) {
    if (uploadedPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage
        .from(NOTE_PHOTO_BUCKET)
        .remove(uploadedPaths);

      if (cleanupError) {
        console.error("Yarım kalan fotoğraf yüklemesi temizlenemedi:", cleanupError);
        throw createPhotoOperationError(
          "cleanup",
          error,
          "Fotoğraf yüklemesi tamamlanamadı."
        );
      }
    }

    throw error;
  }
}
