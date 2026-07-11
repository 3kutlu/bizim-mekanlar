import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCollectionErrorMessage } from "../../utils/actionErrors.js";
import { supabase } from "../../supabase.js";
import AppIcon, { CollectionIcon } from "../../components/AppIcon.jsx";
import { useProfilePhotoUrls } from "../../utils/profilePhotos.js";

const ICON_OPTIONS = [
  "bookmark",
  "heart",
  "star",
  "coffee",
  "martini",
  "fork-knife",
  "map-pin",
  "storefront",
  "push-pin-fill",
  "flag-banner-fold",
  "paw-print",
  "barbell",
];

const LEGACY_ICON_ALIASES = Object.freeze({
  flag: "flag-banner-fold",
  "push-pin": "push-pin-fill",
  paw: "paw-print",
});

const COLOR_OPTIONS = [
  { code: "BURGUNDY", label: "Bordo" },
  { code: "PURPLE", label: "Mor" },
  { code: "BLUE", label: "Mavi" },
  { code: "GREEN", label: "Yeşil" },
  { code: "ORANGE", label: "Turuncu" },
  { code: "YELLOW", label: "Sarı" },
  { code: "PINK", label: "Pembe" },
  { code: "SLATE", label: "Gri" },
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

function normalizeCollectionIcon(value) {
  const normalized = String(value ?? "bookmark").trim() || "bookmark";
  const aliased = LEGACY_ICON_ALIASES[normalized] || normalized;
  return ICON_OPTIONS.includes(aliased) ? aliased : "bookmark";
}

function normalizeColorCode(value) {
  const normalized = String(value ?? "BURGUNDY").trim().toUpperCase();
  return COLOR_OPTIONS.some((option) => option.code === normalized)
    ? normalized
    : "BURGUNDY";
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

function getDisplayName(user) {
  const fullName = [user?.FirstName, user?.LastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return fullName || user?.Username || "Kullanıcı";
}

function getAvatarLetter(user) {
  return String(user?.Username || user?.FirstName || "K")
    .charAt(0)
    .toUpperCase();
}

function CollectionMemberAvatar({ user, photoUrl = "", className = "" }) {
  return (
    <span className={`collection-member-avatar${className ? ` ${className}` : ""}`} aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" /> : getAvatarLetter(user)}
    </span>
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
  const canEditDetails = isCreate || Boolean(list?.CanEditDetails ?? list?.IsOwner ?? true);
  const canManageCollaborators = canEditDetails && !isSystemList;
  const initialName = String(list?.Name ?? "").trim();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(String(list?.Description ?? "").trim());
  const [icon, setIcon] = useState(normalizeCollectionIcon(list?.Icon));
  const [colorCode, setColorCode] = useState(normalizeColorCode(list?.ColorCode));
  const [visibilityCode, setVisibilityCode] = useState(
    normalizeVisibility(list?.VisibilityCode)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [collaborators, setCollaborators] = useState([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [collaboratorSearch, setCollaboratorSearch] = useState("");
  const [collaboratorResults, setCollaboratorResults] = useState([]);
  const [collaboratorSearchLoading, setCollaboratorSearchLoading] = useState(false);
  const [collaboratorActionUserId, setCollaboratorActionUserId] = useState(null);
  const [collaboratorError, setCollaboratorError] = useState("");
  const dialogRef = useRef(null);

  const collaboratorUserIds = collaborators
    .map((user) => Number(user?.UserId))
    .filter((userId) => Number.isInteger(userId) && userId > 0);
  const collaboratorPhotoUrls = useProfilePhotoUrls(collaboratorUserIds, collaborators.length);


  const loadCollaborators = useCallback(async () => {
    if (isCreate || !Number.isInteger(listId) || listId <= 0) {
      setCollaborators([]);
      return;
    }

    setCollaboratorsLoading(true);
    setCollaboratorError("");

    const { data, error } = await supabase.rpc("GetUserPlaceListCollaborators", {
      p_user_place_list_id: listId,
    });

    if (error) {
      console.error("Koleksiyon ortakları alınamadı:", error);
      // Ortak yokken veya RPC geçici olarak boş dönerken kullanıcıya
      // kırmızı hata göstermeyelim. Arama / ekleme / çıkarma hataları
      // zaten aşağıdaki aksiyon akışlarında görünür.
      setCollaborators([]);
    } else {
      setCollaborators(data ?? []);
    }

    setCollaboratorsLoading(false);
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
    void loadCollaborators();
  }, [loadCollaborators]);

  useEffect(() => {
    if (!canManageCollaborators) {
      setCollaboratorResults([]);
      setCollaboratorSearchLoading(false);
      return undefined;
    }

    const query = collaboratorSearch.trim();

    if (query.length < 2) {
      setCollaboratorResults([]);
      setCollaboratorSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCollaboratorSearchLoading(true);
      setCollaboratorError("");

      const { data, error } = await supabase.rpc("SearchMyMutualFollowersForPlaceList", {
        p_user_place_list_id: isCreate ? null : listId,
        p_query: query,
      });

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Koleksiyon ortağı araması yapılamadı:", error);
        setCollaboratorResults([]);
        setCollaboratorError(error.message || "Arkadaş araması yapılamadı.");
      } else {
        setCollaboratorResults(data ?? []);
      }

      setCollaboratorSearchLoading(false);
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canManageCollaborators, collaboratorSearch, isCreate, listId]);

  const addCollaborator = async (user) => {
    const userId = Number(user?.UserId);

    if (!Number.isInteger(userId) || userId <= 0 || collaboratorActionUserId) {
      return;
    }

    setCollaboratorActionUserId(userId);
    setCollaboratorError("");

    if (isCreate) {
      setCollaborators((currentUsers) => {
        const withoutSameUser = currentUsers.filter(
          (currentUser) => Number(currentUser?.UserId) !== userId
        );
        return [
          ...withoutSameUser,
          {
            ...user,
            RoleCode: "COLLABORATOR",
            CanRemove: true,
          },
        ];
      });
      setCollaboratorResults((currentResults) =>
        currentResults.map((result) =>
          Number(result?.UserId) === userId
            ? { ...result, IsCollaborator: true }
            : result
        )
      );
      setCollaboratorSearch("");
      setCollaboratorActionUserId(null);
      return;
    }

    const { data, error } = await supabase.rpc("AddUserPlaceListCollaborator", {
      p_user_place_list_id: listId,
      p_user_id: userId,
    });

    if (error) {
      console.error("Koleksiyon ortağı eklenemedi:", error);
      setCollaboratorError(error.message || "Kişi koleksiyona eklenemedi.");
      setCollaboratorActionUserId(null);
      return;
    }

    const addedUser = getResultRow(data);
    if (addedUser) {
      setCollaborators((currentUsers) => {
        const withoutSameUser = currentUsers.filter(
          (currentUser) => Number(currentUser?.UserId) !== userId
        );
        return [...withoutSameUser, addedUser];
      });
    }

    setCollaboratorResults((currentResults) =>
      currentResults.map((result) =>
        Number(result?.UserId) === userId
          ? { ...result, IsCollaborator: true }
          : result
      )
    );
    setCollaboratorSearch("");
    setCollaboratorActionUserId(null);
  };

  const removeCollaborator = async (user) => {
    const userId = Number(user?.UserId);

    if (!Number.isInteger(userId) || userId <= 0 || collaboratorActionUserId) {
      return;
    }

    setCollaboratorActionUserId(userId);
    setCollaboratorError("");

    if (!isCreate) {
      const { error } = await supabase.rpc("RemoveUserPlaceListCollaborator", {
        p_user_place_list_id: listId,
        p_user_id: userId,
      });

      if (error) {
        console.error("Koleksiyon ortağı çıkarılamadı:", error);
        setCollaboratorError(error.message || "Kişi koleksiyondan çıkarılamadı.");
        setCollaboratorActionUserId(null);
        return;
      }
    }

    setCollaborators((currentUsers) =>
      currentUsers.filter((currentUser) => Number(currentUser?.UserId) !== userId)
    );
    setCollaboratorResults((currentResults) =>
      currentResults.map((result) =>
        Number(result?.UserId) === userId
          ? { ...result, IsCollaborator: false }
          : result
      )
    );
    setCollaboratorActionUserId(null);
  };

  const handleBackdropMouseDown = (event) => {
    if (!isSaving && event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextName = name.trim();
    const nextDescription = toNullableText(description);

    if (!canEditDetails) {
      setErrorMessage("Bu koleksiyonun detaylarını yalnızca sahibi düzenleyebilir.");
      return;
    }

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
          p_color_code: colorCode,
        })
      : supabase.rpc("UpdateMyPlaceListV2", {
          p_user_place_list_id: listId,
          p_name: nextName,
          p_description: nextDescription,
          p_icon: icon,
          p_visibility_code: visibilityCode,
          p_color_code: colorCode,
        });

    const { data, error } = await request;

    if (error) {
      console.error("Koleksiyon kaydedilemedi:", error);
      setErrorMessage(getCollectionErrorMessage(error));
      setIsSaving(false);
      return;
    }

    const returnedList = getResultRow(data);
    const savedListId = Number(returnedList?.UserPlaceListId ?? listId);

    if (isCreate && Number.isInteger(savedListId) && savedListId > 0) {
      const pendingCollaborators = collaborators.filter((user) => {
        const userId = Number(user?.UserId);
        return Number.isInteger(userId) && userId > 0;
      });

      for (const collaborator of pendingCollaborators) {
        const userId = Number(collaborator?.UserId);
        const { error: collaboratorSaveError } = await supabase.rpc(
          "AddUserPlaceListCollaborator",
          {
            p_user_place_list_id: savedListId,
            p_user_id: userId,
          }
        );

        if (collaboratorSaveError) {
          console.error("Yeni koleksiyon ortağı eklenemedi:", collaboratorSaveError);
        }
      }
    }

    onSaved?.({
      ...list,
      ...returnedList,
      UserPlaceListId: returnedList?.UserPlaceListId ?? listId,
      Name: returnedList?.Name ?? nextName,
      Description: returnedList?.Description ?? nextDescription,
      Icon: returnedList?.Icon ?? icon,
      ColorCode: returnedList?.ColorCode ?? colorCode,
      VisibilityCode: returnedList?.VisibilityCode ?? visibilityCode,
      CoverPlaceNotePhotoId:
        returnedList?.CoverPlaceNotePhotoId ?? list?.CoverPlaceNotePhotoId ?? null,
      CoverStoragePath:
        returnedList?.CoverStoragePath ?? list?.CoverStoragePath ?? null,
      CoverSignedUrl: list?.CoverSignedUrl ?? "",
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
              disabled={isSaving || isDeleting || !canEditDetails}
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
                disabled={isSaving || isDeleting || !canEditDetails}
                onChange={(event) => setName(event.target.value)}
                placeholder="Örn. Pazar kahveleri"
              />
            </label>

            <label>
              Kısa açıklama <small>(opsiyonel)</small>
              <textarea
                value={description}
                maxLength="180"
                disabled={isSaving || isDeleting || !canEditDetails}
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
                    aria-label={`${option} sembolünü seç`}
                    className={icon === option ? "collection-icon-option collection-icon-option-active" : "collection-icon-option"}
                    disabled={isSaving || isDeleting || !canEditDetails}
                    onClick={() => setIcon(option)}
                  >
                    <CollectionIcon value={option} />
                  </button>
                ))}
              </div>
            </div>

            <div className="collection-color-field">
              <span>Renk</span>
              <div className="collection-color-picker" role="radiogroup" aria-label="Koleksiyon rengi">
                {COLOR_OPTIONS.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    role="radio"
                    aria-checked={colorCode === option.code}
                    aria-label={`${option.label} rengini seç`}
                    className={`collection-color-option collection-color-${option.code.toLowerCase()}${
                      colorCode === option.code ? " collection-color-option-active" : ""
                    }`}
                    disabled={isSaving || isDeleting || !canEditDetails}
                    onClick={() => setColorCode(option.code)}
                  >
                    <span aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <label>
              Görünürlük
              <select
                value={visibilityCode}
                disabled={isSaving || isDeleting || !canEditDetails}
                onChange={(event) => setVisibilityCode(event.target.value)}
              >
                <option value="PRIVATE">Gizli</option>
                <option value="PUBLIC">Herkese açık</option>
              </select>
              <small>Herkese açık listeler, profilini görebilen kişilere görünür.</small>
            </label>


            <div className="collection-collaborator-field">
                <div className="collection-collaborator-heading">
                  <div>
                    <span>Ortaklar</span>
                    <small>
                      {canManageCollaborators
                        ? "Yalnızca karşılıklı takipleştiğin kişileri ekleyebilirsin."
                        : "Bu koleksiyonun ortaklarını burada görebilirsin."}
                    </small>
                  </div>
                </div>

                {collaboratorsLoading && (
                  <p className="collection-collaborator-state">Ortaklar yükleniyor...</p>
                )}

                {!collaboratorsLoading && collaborators.length > 0 && (
                  <div className="collection-collaborator-list" aria-label="Koleksiyon ortakları">
                    {collaborators.map((user) => {
                      const userId = Number(user?.UserId);
                      const isOwnerMember = String(user?.RoleCode ?? "").toUpperCase() === "OWNER";
                      const canRemove = canManageCollaborators && Boolean(user?.CanRemove);

                      return (
                        <div className="collection-collaborator-row" key={`${user?.RoleCode}-${userId}`}>
                          <CollectionMemberAvatar user={user} photoUrl={collaboratorPhotoUrls[userId]} />
                          <span>
                            <strong>@{user?.Username || "kullanici"}</strong>
                            <small>{isOwnerMember ? "Sahip" : "Ortak"}</small>
                          </span>
                          {canRemove && (
                            <button
                              type="button"
                              disabled={collaboratorActionUserId === userId || isSaving || isDeleting}
                              onClick={() => removeCollaborator(user)}
                            >
                              {collaboratorActionUserId === userId ? "Çıkarılıyor..." : "Çıkar"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {canManageCollaborators && (
                  <div className="collection-collaborator-search">
                    <label>
                      Arkadaş ekle
                      <input
                        type="search"
                        value={collaboratorSearch}
                        disabled={isSaving || isDeleting}
                        onChange={(event) => setCollaboratorSearch(event.target.value)}
                        placeholder="Kullanıcı adı veya isim ara"
                      />
                    </label>

                    {collaboratorSearch.trim().length > 0 && collaboratorSearch.trim().length < 2 && (
                      <p className="collection-collaborator-state">Aramak için en az 2 karakter yaz.</p>
                    )}

                    {collaboratorSearchLoading && (
                      <p className="collection-collaborator-state">Arkadaşlar aranıyor...</p>
                    )}

                    {!collaboratorSearchLoading && collaboratorResults.length > 0 && (
                      <div className="collection-collaborator-results" aria-label="Eklenebilir arkadaşlar">
                        {collaboratorResults.map((user) => {
                          const userId = Number(user?.UserId);
                          const isAlreadyCollaborator = Boolean(user?.IsCollaborator);

                          return (
                            <button
                              className="collection-collaborator-result"
                              type="button"
                              key={userId}
                              disabled={isAlreadyCollaborator || collaboratorActionUserId === userId || isSaving || isDeleting}
                              onClick={() => addCollaborator(user)}
                            >
                              <CollectionMemberAvatar user={user} />
                              <span>
                                <strong>@{user?.Username || "kullanici"}</strong>
                                <small>{getDisplayName(user)}</small>
                              </span>
                              <em>{isAlreadyCollaborator ? "Ekli" : "Ekle"}</em>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {collaboratorError && (
                  <p className="collection-collaborator-error" role="alert">{collaboratorError}</p>
                )}
              </div>

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
                disabled={isSaving || isDeleting || !canEditDetails}
              >
                {!canEditDetails ? "Sadece görüntüle" : isSaving ? "Kaydediliyor..." : isCreate ? "Oluştur" : "Kaydet"}
              </button>
            </div>
          </form>

          {!isCreate && !isSystemList && canEditDetails && (
            <div className="collection-delete-section">
              <div>
                <strong>Bu koleksiyonu sil</strong>
                <span>Mekanların ve notların silinmez.</span>
              </div>
              <button
                type="button"
                disabled={isSaving || isDeleting || !canEditDetails}
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
