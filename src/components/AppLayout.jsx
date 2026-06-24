import { PAGE_IDS } from "../constants/navigation.js";
import Navigation from "./Navigation.jsx";

function AppLayout({ activePage, onNavigate, children }) {
  const isMapPage = activePage === PAGE_IDS.MAP;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="logo-button"
          type="button"
          onClick={() => onNavigate(PAGE_IDS.MAP)}
        >
          Bizim Mekanlar
        </button>

        <Navigation
          variant="desktop"
          activePage={activePage}
          onNavigate={onNavigate}
        />
      </header>

      <main className={`page-content ${isMapPage ? "page-content-map" : ""}`}>
        {children}
      </main>

      <Navigation
        variant="mobile"
        activePage={activePage}
        onNavigate={onNavigate}
      />
    </div>
  );
}

export default AppLayout;
