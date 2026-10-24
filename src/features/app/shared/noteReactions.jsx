import { useState } from "react";
import AppIcon from "../../../components/AppIcon.jsx";
import { supabase } from "../../../supabase.js";

export function normalizeReactionSummary(value) {
  const code = String(value?.MyReactionCode ?? "").trim().toUpperCase();

  return {
    UpCount: Math.max(0, Number(value?.UpCount) || 0),
    DownCount: Math.max(0, Number(value?.DownCount) || 0),
    MyReactionCode: code === "UP" || code === "DOWN" ? code : null,
  };
}

export function getReactionNoteId(note) {
  const candidate =
    note?.PlaceNoteId ??
    note?.PlaceNoteID ??
    note?.placeNoteId ??
    note?.NoteId ??
    note?.NoteID ??
    note?.noteId ??
    note?.Id ??
    note?.id ??
    null;

  const normalizedId = Number(candidate);

  return Number.isInteger(normalizedId) && normalizedId > 0
    ? normalizedId
    : null;
}

export function getReactionSummaryRows(payload) {
  let normalizedPayload = payload;

  if (typeof normalizedPayload === "string") {
    try {
      normalizedPayload = JSON.parse(normalizedPayload);
    } catch {
      return [];
    }
  }

  if (Array.isArray(normalizedPayload)) {
    return normalizedPayload;
  }

  if (Array.isArray(normalizedPayload?.data)) {
    return normalizedPayload.data;
  }

  if (Array.isArray(normalizedPayload?.items)) {
    return normalizedPayload.items;
  }

  if (
    normalizedPayload &&
    typeof normalizedPayload === "object" &&
    getReactionNoteId(normalizedPayload)
  ) {
    return [normalizedPayload];
  }

  return [];
}

export function NoteReactionControls({
  noteId,
  noteOwnerUserId,
  currentUserId,
  summary,
  onSummaryChange,
  variant = "feed",
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const normalizedNoteId = Number(noteId);
  const normalizedOwnerId = Number(noteOwnerUserId);
  const normalizedCurrentUserId = Number(currentUserId);
  const isOwnNote =
    Number.isInteger(normalizedOwnerId) &&
    Number.isInteger(normalizedCurrentUserId) &&
    normalizedOwnerId === normalizedCurrentUserId;
  const reactionSummary = normalizeReactionSummary(summary);

  const updateReaction = async (event, requestedCode) => {
    event.stopPropagation();

    if (
      isOwnNote ||
      isSaving ||
      !Number.isInteger(normalizedNoteId) ||
      normalizedNoteId <= 0
    ) {
      return;
    }

    const nextCode =
      reactionSummary.MyReactionCode === requestedCode ? null : requestedCode;

    setIsSaving(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("SetMyPlaceNoteReaction", {
      p_place_note_id: normalizedNoteId,
      p_reaction_code: nextCode,
    });

    if (error) {
      console.error("Not reaksiyonu güncellenemedi:", error);
      setErrorMessage(error.message || "Reaksiyon güncellenemedi.");
      setIsSaving(false);
      return;
    }

    const nextSummary = Array.isArray(data) ? data[0] : data;
    onSummaryChange?.(normalizedNoteId, normalizeReactionSummary(nextSummary));
    setIsSaving(false);
  };

  const controlsClassName = `note-reactions note-reactions-${variant}`;

  if (isOwnNote) {
    return (
      <div
        className={`${controlsClassName} note-reactions-readonly`}
        aria-label={`${reactionSummary.UpCount} beğeni, ${reactionSummary.DownCount} beğenmeme`}
      >
        <span className="note-reaction-static">
          <strong>{reactionSummary.UpCount}</strong>
          <AppIcon name="thumbs-up-fill" />
        </span>
        <span className="note-reaction-static">
          <strong>{reactionSummary.DownCount}</strong>
          <AppIcon name="thumbs-down-fill" />
        </span>
      </div>
    );
  }

  return (
    <div className={controlsClassName} aria-label="Not reaksiyonları">
      <button
        className={`note-reaction-button note-reaction-up${
          reactionSummary.MyReactionCode === "UP" ? " note-reaction-active" : ""
        }`}
        type="button"
        disabled={isSaving || !Number.isInteger(normalizedNoteId)}
        aria-pressed={reactionSummary.MyReactionCode === "UP"}
        aria-label={`${reactionSummary.UpCount} beğeni. ${
          reactionSummary.MyReactionCode === "UP" ? "Beğeniyi kaldır" : "Beğen"
        }`}
        title={reactionSummary.MyReactionCode === "UP" ? "Beğeniyi kaldır" : "Beğen"}
        onClick={(event) => updateReaction(event, "UP")}
      >
        <strong>{reactionSummary.UpCount}</strong>
        <AppIcon name="thumbs-up-fill" />
      </button>

      <button
        className={`note-reaction-button note-reaction-down${
          reactionSummary.MyReactionCode === "DOWN" ? " note-reaction-active" : ""
        }`}
        type="button"
        disabled={isSaving || !Number.isInteger(normalizedNoteId)}
        aria-pressed={reactionSummary.MyReactionCode === "DOWN"}
        aria-label={`${reactionSummary.DownCount} beğenmeme. ${
          reactionSummary.MyReactionCode === "DOWN"
            ? "Beğenmemeyi kaldır"
            : "Beğenme"
        }`}
        title={
          reactionSummary.MyReactionCode === "DOWN"
            ? "Beğenmemeyi kaldır"
            : "Beğenme"
        }
        onClick={(event) => updateReaction(event, "DOWN")}
      >
        <strong>{reactionSummary.DownCount}</strong>
        <AppIcon name="thumbs-down-fill" />
      </button>

      {errorMessage && (
        <span className="note-reaction-error" role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
