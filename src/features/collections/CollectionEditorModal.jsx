import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCollectionErrorMessage } from "../../utils/actionErrors.js";
import { createSignedNotePhotoUrls } from "../../utils/notePhotos.js";
import { supabase } from "../../supabase.js";
import AppIcon, { CollectionIcon } from "../../components/AppIcon.jsx";

const ICON_OPTIONS = [
  "bookmark", "heart", "star", "coffee", "martini", "fork-knife",
  "map-pin", "flag", "push-pin", "storefront", "barbell", "paw",
];

function toNullableText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function getResultRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

function normalizeVisibility(value) {
  return String(value ?? "PRIVATE").trim().toUpperCase() === "PUBLIC"
    ? "PUBLIC"
    : "PRIVATE";
}

function CollectionDeleteConfirm({ listName, isDeleting, errorMessage, onCancel, onConfirm }) {
  return createPortal(
    <div className="collection-delete-backdrop" role="presentation" onMouseDown={(event) => {
      if (!isDeleting && event.target === event.currentTarget) {
        onCancel();
      }
    }}>
      <section
        className="collection-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-delete-title"
      >
        <p className="eyebrow">KOLEKSİYON</p>
        <h3 id="collection-delete-title">Listeyi sil</h3>
        <p>
          <strong>{listName}</strong> ve içindeki mekan kayıtları kaldırılacak.
          Mekanların kendisi ve notların silinmez.
        </p>
        {errorMessage && <p className="collection-delete-error" role="alert">{errorMessage}</p>}
        <div className="collection-delete-actions">
          <button type="button" disabled={isDeleting} onClick={onCancel}>Vazgeç</button>
          <button
            className="collection-delete-confirm"
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? "Siliniyor..." : "Listeyi sil"}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

export function PlaceListEditModal({
  list = null,
  mode = "edit",
  onClose,
  onSaved,
  onDeleted,
}) {
  const isCreate = mode === "create" || !list?.UserPlaceListId;
  const listId = Number(list?.UserPlaceListId);
  const isSystemList = Boolean(list?.IsSystem);
  const initialName = String(list?.Name ?? "").trim();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(String(list?.Description ?? "").trim());
  const [icon, setIcon] = useState(String(list?.Icon ?? "bookmark").trim() || "bookmark");
  const [visibilityCode, setVisibilityCode] = useState(
    normalizeVisibility(list?.VisibilityCode)
  );
  const [coverOptions, setCoverOptions] = useState([]);
  const [coverLoading, setCoverLoading] = useState(false);
  const [selectedCoverPhotoId, setSelectedCoverPhotoId] = useState(
    Number(list?.CoverPlaceNotePhotoId) || null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const dialogRef = useRef(null);

  const loadCoverOptions = useCallback(async () => {
    if (isCreate || !Number.isInteger(listId) || listId <= 0) {
      setCoverOptions([]);
      setCoverLoading(false);
      return;
    }

    setCoverLoading(true);

    const { data, error } = await supabase.rpc("GetMyPlaceListCoverOptions", {
      p_user_place_list_id: listId,
    });

    if (error) {
      console.error("Koleksiyon kapak seçenekleri alınamadı:", error);
      setCoverOptions([]);
      setCoverLoading(false);
      return;
    }

    try {
      setCoverOptions(await createSignedNotePhotoUrls(data ?? []));
    } catch (signedUrlError) {
      console.error("Koleksiyon kapak bağlantıları oluşturulamadı:", signedUrlError);
      setCoverOptions([]);
    } finally {
      setCoverLoading(false);
    }
  }, [isCreate, listId]);

  useEffect(() => {
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSaving && !isDeleting) {
        if (isDeleteConfirmOpen) {
          setIsDeleteConfirmOpen(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDeleteConfirmOpen, isDeleting, isSaving, onClose]);

  useEffect(() => {
    void loadCoverOptions();
  }, [loadCoverOptions]);

  const handleBackdropMouseDown = (event) => {
    if (!isSaving && event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextName = name.trim();
    const nextDescription = toNullableText(description);

    if (!nextName) {
      setErrorMessage("Koleksiyon adı boş olamaz.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const request = isCreate
      ? supabase.rpc("CreateMyPlaceListV2", {
          p_name: nextName,
          p_description: nextDescription,
          p_icon: icon,
          p_visibility_code: visibilityCode,
        })
      : supabase.rpc("UpdateMyPlaceListV2", {
          p_user_place_list_id: listId,
          p_name: nextName,
          p_description: nextDescription,
          p_icon: icon,
          p_visibility_code: visibilityCode,
          p_cover_place_note_photo_id: selectedCoverPhotoId,
        });

    const { data, error } = await request;

    if (error) {
      console.error("Koleksiyon kaydedilemedi:", error);
      setErrorMessage(getCollectionErrorMessage(error));
      setIsSaving(false);
      return;
    }

    const returnedList = getResultRow(data);
    const selectedCover = coverOptions.find(
      (photo) => Number(photo?.PlaceNotePhotoId) === Number(selectedCoverPhotoId)
    );

    onSaved?.({
      ...list,
      ...returnedList,
      UserPlaceListId: returnedList?.UserPlaceListId ?? listId,
      Name: returnedList?.Name ?? nextName,
      Description: returnedList?.Description ?? nextDescription,
      Icon: returnedList?.Icon ?? icon,
      VisibilityCode: returnedList?.VisibilityCode ?? visibilityCode,
      CoverPlaceNotePhotoId:
        returnedList?.CoverPlaceNotePhotoId ?? selectedCoverPhotoId,
      CoverStoragePath:
        returnedList?.CoverStoragePath ?? selectedCover?.StoragePath ?? null,
      CoverSignedUrl: selectedCover?.SignedUrl ?? "",
      IsSystem: returnedList?.IsSystem ?? Boolean(list?.IsSystem),
      PlaceCount: returnedList?.PlaceCount ?? list?.PlaceCount ?? 0,
    });
  };

  const deleteCollection = async () => {
    if (!Number.isInteger(listId) || listId <= 0 || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    const { error } = await supabase.rpc("DeleteMyPlaceListV2", {
      p_user_place_list_id: listId,
    });

    if (error) {
      console.error("Koleksiyon silinemedi:", error);
      setDeleteError(getCollectionErrorMessage(error));
      setIsDeleting(false);
      return;
    }

    onDeleted?.(listId);
  };

  const title = isCreate ? "Yeni koleksiyon" : "Listeyi düzenle";

  return (
    <>
      <div
        className="place-list-edit-backdrop"
        role="presentation"
        onMouseDown={handleBackdropMouseDown}
      >
        <section
          ref={dialogRef}
          className="place-list-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="place-list-edit-title"
          tabIndex={-1}
        >
          <div className="place-list-edit-header">
            <div>
              <p className="eyebrow">KOLEKSİYON</p>
              <h2 id="place-list-edit-title">{title}</h2>
            </div>
            <button
              className="place-list-edit-close"
              type="button"
              onClick={onClose}
              disabled={isSaving || isDeleting}
              aria-label="Kapat"
            >
              <AppIcon name="x" />
            </button>
          </div>

          <form className="place-list-edit-form" onSubmit={handleSubmit}>
            <label>
              Koleksiyon adı
              <input
                type="text"
                value={name}
                minLength="1"
                maxLength="60"
                autoFocus
                disabled={isSaving || isDeleting}
                onChange={(event) => setName(event.target.value)}
                placeholder="Örn. Pazar kahveleri"
              />
            </label>

            <label>
              Kısa açıklama <small>(opsiyonel)</small>
              <textarea
                value={description}
                maxLength="180"
                disabled={isSaving || isDeleting}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Bu listede nasıl mekanlar var?"
              />
              <small>{description.length} / 180</small>
            </label>

            <div className="collection-icon-field">
              <span>Sembol</span>
              <div className="collection-icon-picker" role="radiogroup" aria-label="Koleksiyon sembolü">
                {ICON_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={icon === option}
                    className={icon === option ? "collection-icon-option collection-icon-option-active" : "collection-icon-option"}
                    disabled={isSaving || isDeleting}
                    onClick={() => setIcon(option)}
                  >
                    <CollectionIcon value={option} />
                  </button>
                ))}
              </div>
            </div>

            <label>
              Görünürlük
              <select
                value={visibilityCode}
                disabled={isSaving || isDeleting}
                onChange={(event) => setVisibilityCode(event.target.value)}
              >
                <option value="PRIVATE">Gizli</option>
                <option value="PUBLIC">Herkese açık</option>
              </select>
              <small>Herkese açık listeler, profilini görebilen kişilere görünür.</small>
            </label>

            {!isCreate && (
              <div className="collection-cover-field">
                <div>
                  <span>Kapak fotoğrafı <small>(opsiyonel)</small></span>
                  <small>Bu listedeki kendi not fotoğraflarından birini seçebilirsin.</small>
                </div>

                {coverLoading && <p className="collection-cover-state">Kapaklar yükleniyor...</p>}

                {!coverLoading && coverOptions.length === 0 && (
                  <p className="collection-cover-state">
                    Kapak seçmek için bu listedeki bir mekana fotoğraflı not eklemelisin.
                  </p>
                )}

                {!coverLoading && coverOptions.length > 0 && (
                  <div className="collection-cover-grid" aria-label="Kapak fotoğrafı seçenekleri">
                    <button
                      className={`collection-cover-none${!selectedCoverPhotoId ? " collection-cover-selected" : ""}`}
                      type="button"
                      disabled={isSaving || isDeleting}
                      aria-pressed={!selectedCoverPhotoId}
                      onClick={() => setSelectedCoverPhotoId(null)}
                    >
                      Kapak yok
                    </button>
                    {coverOptions.map((photo) => {
                      const photoId = Number(photo?.PlaceNotePhotoId);
                      const isSelected = photoId === Number(selectedCoverPhotoId);

                      return (
                        <button
                          className={`collection-cover-option${isSelected ? " collection-cover-selected" : ""}`}
                          type="button"
                          key={photoId}
                          disabled={isSaving || isDeleting || !photo?.SignedUrl}
                          aria-pressed={isSelected}
                          title={`${photo?.PlaceName || "Mekan"} fotoğrafını kapak yap`}
                          onClick={() => setSelectedCoverPhotoId(photoId)}
                        >
                          <img src={photo.SignedUrl} alt={`${photo?.PlaceName || "Mekan"} fotoğrafı`} />
                          <span>{photo?.PlaceName || "Mekan"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {errorMessage && (
              <p className="place-list-edit-error" role="alert">{errorMessage}</p>
            )}

            <div className="place-list-edit-actions">
              <button
                className="place-list-edit-cancel"
                type="button"
                onClick={onClose}
                disabled={isSaving || isDeleting}
              >
                Vazgeç
              </button>
              <button
                className="place-list-edit-save"
                type="submit"
                disabled={isSaving || isDeleting}
              >
                {isSaving ? "Kaydediliyor..." : isCreate ? "Oluştur" : "Kaydet"}
              </button>
            </div>
          </form>

          {!isCreate && !isSystemList && (
            <div className="collection-delete-section">
              <div>
                <strong>Bu koleksiyonu sil</strong>
                <span>Mekanların ve notların silinmez.</span>
              </div>
              <button
                type="button"
                disabled={isSaving || isDeleting}
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                Listeyi sil
              </button>
            </div>
          )}
        </section>
      </div>

      {isDeleteConfirmOpen && (
        <CollectionDeleteConfirm
          listName={initialName || "Bu koleksiyon"}
          isDeleting={isDeleting}
          errorMessage={deleteError}
          onCancel={() => {
            if (!isDeleting) {
              setDeleteError("");
              setIsDeleteConfirmOpen(false);
            }
          }}
          onConfirm={deleteCollection}
        />
      )}
    </>
  );
}
