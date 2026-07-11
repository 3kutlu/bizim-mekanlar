# Backend Sözleşmesi

Bu refactor Supabase SQL tarafına dokunmaz. Aşağıdaki istemci bağımlılıkları mevcut fonksiyon isimleriyle korunur.

## Auth / profil

- `GetUserProfileSummary`
- `GetUserProfilePhotoPaths`
- `IsUsernameAvailable`
- `UpdateMyProfile`
- `SetMyProfilePhoto`
- `RemoveMyProfilePhoto`

## Takip / bildirim

- `GetMyNotifications`
- `GetMyFollowActivity`
- `MarkMyNoteNotificationsRead`
- `MarkMyFollowActivityRead`
- `RespondToFollowRequest`
- `RequestFollow`
- `UnfollowUser`

## Notlar / mekanlar

- `CreatePlaceNoteWithReviewV3`
- `GetFollowingFeedNoteCardsV2`
- `GetPlaceVisibleNoteCards`
- `GetPlaceNoteDetailV2`
- `UpdateMyPlaceNote`
- `DeleteMyPlaceNoteWithPhotosV2`
- `GetPlaceNoteReactionSummaries`
- `SetMyPlaceNoteReaction`
- `GetPlaceVisibleReviewSummary`
- `GetPlaceRatingSummary`
- `GetVisibleMapVenueNotes`
- `GetPlaceMapTargetV2`

## Fotoğraflar

- `CreateMyPlaceNotePhotos`
- `DeleteMyPlaceNotePhoto`
- `GetVisiblePlaceNotePhotos`
- `GetVisibleUserPlaceNotePhotos`
- `GetPlaceVisibleNotePhotos`

Private Storage buckets:

- `note-photos`: JPG/PNG/WEBP, en çok 8 MB.
- `profile-photos`: JPG/PNG/WEBP, en çok 5 MB.

## Koleksiyonlar

- `GetMyPlaceListsV2`
- `GetMyPlaceListsForPlaceV2`
- `SetMyPlaceListItemV2`
- `UpdateMyPlaceList`
- `GetUserPlaceListItemsV3`
- `RemoveMyPlaceFromListV2`
- `GetVisibleUserPlaceListsV2`

Yeni frontend kodu yazılırken RPC alan adları ve return casing'i bu mevcut sözleşmeye göre korunmalıdır.
