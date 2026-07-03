/* Feature module: extracted without changing UI behavior. */

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../supabase.js";
import { useProfilePhotoUrls } from "../../utils/profilePhotos.js";
import "../../css/user-discovery.css";

function getFullName(user) {
  return [user?.FirstName, user?.LastName].filter(Boolean).join(" ");
}

export default function UserSearchPage({
  isActive,
  onBack,
  onSelectUser,
}) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef(null);
  const profilePhotoUrls = useProfilePhotoUrls(
    users.map((user) => user?.UserId)
  );

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    inputRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onBack();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, onBack]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    let isCurrent = true;

    if (normalizedQuery.length < 2) {
      setUsers([]);
      setErrorMessage("");
      setIsLoading(false);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase.rpc("SearchUsers", {
        p_query: normalizedQuery,
      });

      if (!isCurrent) {
        return;
      }

      if (error) {
        console.error("Kullanıcı araması başarısız:", error);
        setUsers([]);
        setErrorMessage("Kullanıcılar şu an aranamadı. Tekrar dene.");
      } else {
        setUsers(data ?? []);
      }

      setIsLoading(false);
    }, 250);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="discovery-page-content user-search-page">
      <header className="discovery-page-header">
        <div>
          <p className="eyebrow">KEŞFET</p>
          <h1>Kullanıcı ara</h1>
        </div>

        <button
          className="discovery-back-button"
          type="button"
          onClick={onBack}
          aria-label="Geri dön"
        >
          ‹
          <span>Geri</span>
        </button>
      </header>

      <div className="user-search-input-wrap">
        <span aria-hidden="true">⌕</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Kullanıcı adı veya isim ara"
          aria-label="Kullanıcı adı veya isim ara"
          autoComplete="off"
        />
      </div>

      <div className="discovery-page-body user-search-content">
        {query.trim().length < 2 && (
          <p className="user-search-hint">
            Kullanıcı adı, isim veya soyismin en az iki harfini yaz.
          </p>
        )}

        {isLoading && <p className="user-search-hint">Aranıyor...</p>}

        {!isLoading && errorMessage && (
          <p className="user-search-error" role="alert">
            {errorMessage}
          </p>
        )}

        {!isLoading &&
          !errorMessage &&
          query.trim().length >= 2 &&
          users.length === 0 && (
            <p className="user-search-hint">Eşleşen kullanıcı bulunamadı.</p>
          )}

        {!isLoading && users.length > 0 && (
          <div className="user-search-results">
            {users.map((user) => {
              const fullName = getFullName(user);
              const avatarLetter = (user.Username || fullName || "K")
                .charAt(0)
                .toUpperCase();
              const isPrivate = user.AccountVisibilityCode === "PRIVATE";
              const profilePhotoUrl = profilePhotoUrls[Number(user?.UserId)] || "";

              return (
                <button
                  className="user-search-result"
                  type="button"
                  key={user.UserId}
                  onClick={() => onSelectUser(user)}
                >
                  <span className="user-search-avatar" aria-hidden="true">
                    {profilePhotoUrl ? <img src={profilePhotoUrl} alt="" /> : avatarLetter}
                  </span>

                  <span className="user-search-copy">
                    <strong>
                      {user.Username}
                      {isPrivate && (
                        <span
                          className="username-private-lock"
                          role="img"
                          aria-label="Gizli hesap"
                          title="Gizli hesap"
                        >
                          🔒
                        </span>
                      )}
                    </strong>
                    <span>{fullName || user.Username}</span>
                    <small>
                      {[user.CityName, user.ZodiacSign]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>

                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
