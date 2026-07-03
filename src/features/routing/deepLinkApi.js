import { supabase } from "../../supabase.js";

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

async function callTargetRpc(functionName, parameters) {
  const { data, error } = await supabase.rpc(functionName, parameters);

  if (error) {
    console.error(`${functionName} çağrısı başarısız:`, error);
    return { data: null, error };
  }

  return { data: firstRow(data), error: null };
}

export function getUserDeepLinkTargetByUsername(username) {
  return callTargetRpc("GetUserDeepLinkTarget", {
    p_username: username,
    p_public_id: null,
  });
}

export function getUserDeepLinkTargetById(userId) {
  return callTargetRpc("GetUserDeepLinkTargetById", {
    p_user_id: Number(userId),
  });
}

export function getPlaceDeepLinkTarget(publicId) {
  return callTargetRpc("GetPlaceDeepLinkTarget", {
    p_public_id: publicId,
  });
}

export function getPlaceDeepLinkTargetById(placeId) {
  return callTargetRpc("GetPlaceDeepLinkTargetById", {
    p_place_id: Number(placeId),
  });
}

export function getNoteDeepLinkTarget(publicId) {
  return callTargetRpc("GetNoteDeepLinkTarget", {
    p_public_id: publicId,
  });
}

export function getNoteDeepLinkTargetById(noteId) {
  return callTargetRpc("GetNoteDeepLinkTargetById", {
    p_place_note_id: Number(noteId),
  });
}

export function getCollectionDeepLinkTarget(publicId) {
  return callTargetRpc("GetCollectionDeepLinkTarget", {
    p_public_id: publicId,
  });
}

export function getCollectionDeepLinkTargetById(listId) {
  return callTargetRpc("GetCollectionDeepLinkTargetById", {
    p_user_place_list_id: Number(listId),
  });
}
