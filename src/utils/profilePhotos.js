import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";

export const PROFILE_PHOTO_BUCKET = "profile-photos";
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

const ALLOWED_PROFILE_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function normalizeUserIds(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )].sort((left, right) => left - right);
}

function getExtension(file) {
  const byMimeType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  if (byMimeType[file?.type]) {
    return byMimeType[file.type];
  }

  const rawExtension = String(file?.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();

  return rawExtension === "jpeg" ? "jpg" : rawExtension;
}

function createRandomFileToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getProfilePhotoSelectionError(file) {
  if (!file) {
    return "Bir fotoğraf seçmelisin.";
  }

  if (!ALLOWED_PROFILE_PHOTO_TYPES.has(file.type)) {
    return "Yalnızca JPG, PNG veya WEBP fotoğraf seçebilirsin.";
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "Fotoğraf dosyası geçersiz.";
  }

  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return "Profil fotoğrafı en fazla 5 MB olabilir.";
  }

  return "";
}

export function createProfilePhotoDraft(file) {
  const validationError = getProfilePhotoSelectionError(file);

  if (validationError) {
    throw new Error(validationError);
  }

  return {
    file,
    fileName: String(file.name || "profil-fotografi"),
    mimeType: file.type,
    byteSize: file.size,
    previewUrl: URL.createObjectURL(file),
  };
}

export function revokeProfilePhotoDraft(draft) {
  if (draft?.previewUrl) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

export async function uploadMyProfilePhotoDraft(draft) {
  if (!draft?.file) {
    throw new Error("Yüklenecek profil fotoğrafı bulunamadı.");
  }

  const validationError = getProfilePhotoSelectionError(draft.file);

  if (validationError) {
    throw new Error(validationError);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    throw userError || new Error("Oturum doğrulanamadı.");
  }

  const extension = getExtension(draft.file);

  if (!extension || !["jpg", "png", "webp"].includes(extension)) {
    throw new Error("Fotoğraf dosya uzantısı geçersiz.");
  }

  const storagePath = `${user.id}/${createRandomFileToken()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(storagePath, draft.file, {
      cacheControl: "31536000",
      contentType: draft.file.type,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  return {
    storagePath,
    fileName: draft.fileName,
    mimeType: draft.mimeType,
    byteSize: draft.byteSize,
  };
}

export async function deleteMyProfilePhotoObject(storagePath) {
  const normalizedPath = String(storagePath ?? "").trim();

  if (!normalizedPath) {
    return;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    throw userError || new Error("Oturum doğrulanamadı.");
  }

  if (!normalizedPath.startsWith(`${user.id}/`)) {
    throw new Error("Profil fotoğrafı silme yetkin yok.");
  }

  const { error } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .remove([normalizedPath]);

  if (error) {
    throw error;
  }
}

export async function setMyProfilePhotoPath(storagePath) {
  const { data, error } = await supabase.rpc("SetMyProfilePhoto", {
    p_storage_path: storagePath,
  });

  if (error) {
    throw error;
  }

  return String(data ?? "").trim();
}

export async function removeMyProfilePhotoPath() {
  const { data, error } = await supabase.rpc("RemoveMyProfilePhoto");

  if (error) {
    throw error;
  }

  return String(data ?? "").trim();
}

export function useProfilePhotoUrls(userIds, refreshKey = "") {
  const normalizedIds = useMemo(
    () => normalizeUserIds(userIds),
    [JSON.stringify(normalizeUserIds(userIds))]
  );
  const idsKey = normalizedIds.join(",");
  const [photoUrlsByUserId, setPhotoUrlsByUserId] = useState({});

  useEffect(() => {
    let isCurrent = true;

    if (normalizedIds.length === 0) {
      setPhotoUrlsByUserId({});
      return undefined;
    }

    const loadPhotoUrls = async () => {
      const { data: photoRows, error: photoRowsError } = await supabase.rpc(
        "GetUserProfilePhotoPaths",
        {
          p_user_ids: normalizedIds,
        }
      );

      if (!isCurrent) {
        return;
      }

      if (photoRowsError) {
        console.error("Profil fotoğraf yolları alınamadı:", photoRowsError);
        setPhotoUrlsByUserId({});
        return;
      }

      const rows = Array.isArray(photoRows) ? photoRows : [];
      const paths = [...new Set(
        rows
          .map((row) => String(row?.ProfilePhotoPath ?? "").trim())
          .filter(Boolean)
      )];

      if (paths.length === 0) {
        setPhotoUrlsByUserId({});
        return;
      }

      const { data: signedRows, error: signedUrlError } = await supabase.storage
        .from(PROFILE_PHOTO_BUCKET)
        .createSignedUrls(paths, 60 * 60 * 12);

      if (!isCurrent) {
        return;
      }

      if (signedUrlError) {
        console.error("Profil fotoğraf bağlantıları oluşturulamadı:", signedUrlError);
        setPhotoUrlsByUserId({});
        return;
      }

      const urlByPath = new Map(
        (signedRows ?? []).map((row) => [row.path, row.signedUrl])
      );
      const nextUrls = {};

      for (const row of rows) {
        const userId = Number(row?.UserId);
        const path = String(row?.ProfilePhotoPath ?? "").trim();
        const signedUrl = urlByPath.get(path);

        if (Number.isInteger(userId) && userId > 0 && signedUrl) {
          nextUrls[userId] = signedUrl;
        }
      }

      setPhotoUrlsByUserId(nextUrls);
    };

    void loadPhotoUrls();

    return () => {
      isCurrent = false;
    };
  }, [idsKey, refreshKey]);

  return photoUrlsByUserId;
}
