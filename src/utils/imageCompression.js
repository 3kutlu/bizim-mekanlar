const WEBP_MIME_TYPE = "image/webp";
const JPEG_MIME_TYPE = "image/jpeg";

const DEFAULT_IMAGE_COMPRESSION_OPTIONS = Object.freeze({
  maxDimension: 1600,
  mimeType: WEBP_MIME_TYPE,
  quality: 0.78,
  minQuality: 0.62,
  qualityStep: 0.08,
  targetBytes: 1.6 * 1024 * 1024,
  minSavingRatio: 0.98,
});

export const NOTE_PHOTO_COMPRESSION_OPTIONS = Object.freeze({
  maxDimension: 1600,
  mimeType: WEBP_MIME_TYPE,
  quality: 0.78,
  minQuality: 0.62,
  qualityStep: 0.08,
  targetBytes: 1.6 * 1024 * 1024,
  minSavingRatio: 0.98,
});

export const PROFILE_PHOTO_COMPRESSION_OPTIONS = Object.freeze({
  maxDimension: 768,
  mimeType: WEBP_MIME_TYPE,
  quality: 0.82,
  minQuality: 0.68,
  qualityStep: 0.07,
  targetBytes: 320 * 1024,
  minSavingRatio: 0.98,
});

const outputExtensionByMimeType = {
  [WEBP_MIME_TYPE]: "webp",
  [JPEG_MIME_TYPE]: "jpg",
};

function isBrowserImageCompressionSupported() {
  return (
    typeof document !== "undefined" &&
    typeof File !== "undefined" &&
    typeof URL !== "undefined"
  );
}

function getImageDimensions(width, height, maxDimension) {
  const normalizedWidth = Number(width);
  const normalizedHeight = Number(height);
  const normalizedMaxDimension = Number(maxDimension);

  if (
    !Number.isFinite(normalizedWidth) ||
    !Number.isFinite(normalizedHeight) ||
    normalizedWidth <= 0 ||
    normalizedHeight <= 0
  ) {
    return null;
  }

  if (
    !Number.isFinite(normalizedMaxDimension) ||
    normalizedMaxDimension <= 0 ||
    Math.max(normalizedWidth, normalizedHeight) <= normalizedMaxDimension
  ) {
    return {
      width: Math.round(normalizedWidth),
      height: Math.round(normalizedHeight),
    };
  }

  const ratio = normalizedMaxDimension / Math.max(normalizedWidth, normalizedHeight);

  return {
    width: Math.max(1, Math.round(normalizedWidth * ratio)),
    height: Math.max(1, Math.round(normalizedHeight * ratio)),
  };
}

function getFileBaseName(file) {
  const rawName = String(file?.name || "fotoğraf").trim() || "fotoğraf";
  const withoutExtension = rawName.replace(/\.[a-z0-9]{1,8}$/i, "").trim();

  return (withoutExtension || "fotoğraf").slice(0, 180);
}

function makeCompressedFileName(file, mimeType) {
  const extension = outputExtensionByMimeType[mimeType] || "jpg";

  return `${getFileBaseName(file)}.${extension}`;
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Fotoğraf tarayıcıda okunamadı."));
    };

    image.src = objectUrl;
  });
}

async function loadImageSource(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });

      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      // Some browsers can expose createImageBitmap but still fail for HEIC-like
      // camera exports. Fall back to the standard image element path.
    }
  }

  const image = await loadImageElement(file);

  return {
    source: image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    cleanup: () => {},
  };
}

function normalizeCompressionOptions(options) {
  return {
    ...DEFAULT_IMAGE_COMPRESSION_OPTIONS,
    ...(options ?? {}),
  };
}

async function encodeCanvas(canvas, file, options) {
  let bestBlob = null;
  let quality = Number(options.quality);
  const minQuality = Number(options.minQuality);
  const qualityStep = Number(options.qualityStep);
  const targetBytes = Number(options.targetBytes);

  while (quality >= minQuality) {
    const blob = await canvasToBlob(canvas, options.mimeType, quality);

    if (!blob || blob.type !== options.mimeType) {
      break;
    }

    if (!bestBlob || blob.size < bestBlob.size) {
      bestBlob = blob;
    }

    if (Number.isFinite(targetBytes) && targetBytes > 0 && blob.size <= targetBytes) {
      break;
    }

    quality -= qualityStep;
  }

  if (bestBlob || options.mimeType !== WEBP_MIME_TYPE || file.type !== JPEG_MIME_TYPE) {
    return bestBlob;
  }

  // Very old browsers may not support WebP canvas encoding. For JPEG inputs we
  // can still safely try JPEG output. For PNG/WEBP inputs, keeping the original
  // avoids accidental transparency loss or larger files.
  quality = Number(options.quality);
  bestBlob = null;

  while (quality >= minQuality) {
    const blob = await canvasToBlob(canvas, JPEG_MIME_TYPE, quality);

    if (!blob || blob.type !== JPEG_MIME_TYPE) {
      break;
    }

    if (!bestBlob || blob.size < bestBlob.size) {
      bestBlob = blob;
    }

    if (Number.isFinite(targetBytes) && targetBytes > 0 && blob.size <= targetBytes) {
      break;
    }

    quality -= qualityStep;
  }

  return bestBlob;
}

export async function compressImageFile(file, options) {
  if (
    !file ||
    typeof file.size !== "number" ||
    !String(file.type || "").startsWith("image/") ||
    !isBrowserImageCompressionSupported()
  ) {
    return file;
  }

  const normalizedOptions = normalizeCompressionOptions(options);
  let imageSource = null;

  try {
    imageSource = await loadImageSource(file);
    const dimensions = getImageDimensions(
      imageSource.width,
      imageSource.height,
      normalizedOptions.maxDimension
    );

    if (!dimensions) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext("2d", {
      alpha: normalizedOptions.mimeType !== JPEG_MIME_TYPE,
    });

    if (!context) {
      return file;
    }

    context.drawImage(imageSource.source, 0, 0, dimensions.width, dimensions.height);

    const compressedBlob = await encodeCanvas(canvas, file, normalizedOptions);
    const minSavingRatio = Number(normalizedOptions.minSavingRatio) || 1;

    if (!compressedBlob || compressedBlob.size >= file.size * minSavingRatio) {
      return file;
    }

    return new File([compressedBlob], makeCompressedFileName(file, compressedBlob.type), {
      type: compressedBlob.type,
      lastModified: file.lastModified || Date.now(),
    });
  } catch (error) {
    console.warn("Fotoğraf sıkıştırılamadı, orijinal dosya yüklenecek:", error);
    return file;
  } finally {
    imageSource?.cleanup?.();
  }
}

export function compressNotePhotoFile(file) {
  return compressImageFile(file, NOTE_PHOTO_COMPRESSION_OPTIONS);
}

export function compressProfilePhotoFile(file) {
  return compressImageFile(file, PROFILE_PHOTO_COMPRESSION_OPTIONS);
}
