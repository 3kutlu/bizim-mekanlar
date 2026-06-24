import { NAVIGATION_ITEMS } from "../constants/navigation.js";

function Navigation({ activePage, onNavigate, variant }) {
  const isMobile = variant === "mobile";

  return (
    <nav className={isMobile ? "bottom-nav" : "desktop-nav"}>
      {NAVIGATION_ITEMS.map((item) => {
        const isActive = activePage === item.id;
        const activeClass = isMobile
          ? "bottom-nav-active"
          : "nav-active";

        return (
          <button
            key={item.id}
            type="button"
            className={isActive ? activeClass : ""}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {isMobile && <span aria-hidden="true">{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export default Navigation;
