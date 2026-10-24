import { useCallback, useEffect, useRef } from "react";
import AppIcon from "../../../components/AppIcon.jsx";
import { BOTTOM_NAV_ITEMS } from "./appConstants.js";

export function SearchIcon() {
  return <AppIcon name="magnifying-glass" />;
}

export function SettingsIcon() {
  return <AppIcon name="gear" />;
}

export function isIOSDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";

  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function getBottomNavIndex(pageId) {
  const index = BOTTOM_NAV_ITEMS.findIndex((item) => item.id === pageId);

  return index >= 0 ? index : 0;
}

export function BottomNavigation({ activePage, onNavigate, liquidGlassEnabled }) {
  const navRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const setLensToIndex = useCallback(
    (index, { stretch = 0, tilt = 0 } = {}) => {
      const nav = navRef.current;

      if (!nav || !liquidGlassEnabled) {
        return;
      }

      const innerWidth = Math.max(0, nav.getBoundingClientRect().width - 12);
      const cellWidth = innerWidth / BOTTOM_NAV_ITEMS.length;

      nav.style.setProperty(
        "--liquid-x",
        `${Math.max(0, Math.min(BOTTOM_NAV_ITEMS.length - 1, index)) * cellWidth}px`
      );
      nav.style.setProperty("--liquid-stretch", String(stretch));
      nav.style.setProperty("--liquid-tilt", `${tilt}deg`);
    },
    [liquidGlassEnabled]
  );

  useEffect(() => {
    if (!liquidGlassEnabled) {
      return undefined;
    }

    const syncLens = () => setLensToIndex(getBottomNavIndex(activePage));

    syncLens();
    window.addEventListener("resize", syncLens);

    return () => window.removeEventListener("resize", syncLens);
  }, [activePage, liquidGlassEnabled, setLensToIndex]);

  const finishDrag = useCallback(
    (event, cancelled = false) => {
      const nav = navRef.current;
      const drag = dragRef.current;

      if (!nav || !drag || event.pointerId !== drag.pointerId) {
        return;
      }

      if (nav.hasPointerCapture?.(event.pointerId)) {
        nav.releasePointerCapture(event.pointerId);
      }

      nav.dataset.dragging = "false";
      dragRef.current = null;

      if (!drag.moved || cancelled) {
        setLensToIndex(getBottomNavIndex(activePage));
        return;
      }

      const destinationIndex = Math.max(
        0,
        Math.min(
          BOTTOM_NAV_ITEMS.length - 1,
          Math.round(drag.currentX / drag.cellWidth)
        )
      );
      const destinationPage = BOTTOM_NAV_ITEMS[destinationIndex].id;

      setLensToIndex(destinationIndex);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);

      if (destinationPage !== activePage) {
        onNavigate(destinationPage);
      }
    },
    [activePage, onNavigate, setLensToIndex]
  );

  const handlePointerDown = (event) => {
    if (
      !liquidGlassEnabled ||
      event.pointerType === "mouse" ||
      !event.isPrimary ||
      !navRef.current
    ) {
      return;
    }

    const nav = navRef.current;
    const innerWidth = Math.max(0, nav.getBoundingClientRect().width - 12);
    const cellWidth = innerWidth / BOTTOM_NAV_ITEMS.length;
    const activeIndex = getBottomNavIndex(activePage);

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLensX: activeIndex * cellWidth,
      cellWidth,
      currentX: activeIndex * cellWidth,
      moved: false,
    };

    nav.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const nav = navRef.current;
    const drag = dragRef.current;

    if (!nav || !drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;

    if (!drag.moved && Math.abs(deltaX) < 7) {
      return;
    }

    drag.moved = true;
    event.preventDefault();
    nav.dataset.dragging = "true";

    const edgeAllowance = drag.cellWidth * 0.13;
    const minX = -edgeAllowance;
    const maxX = drag.cellWidth * (BOTTOM_NAV_ITEMS.length - 1) + edgeAllowance;
    const currentX = Math.max(
      minX,
      Math.min(maxX, drag.startLensX + deltaX)
    );
    const stretch = Math.min(0.12, Math.abs(deltaX) / 520);
    const tilt = Math.max(-1.7, Math.min(1.7, deltaX / 48));

    drag.currentX = currentX;
    nav.style.setProperty("--liquid-x", `${currentX}px`);
    nav.style.setProperty("--liquid-stretch", String(stretch));
    nav.style.setProperty("--liquid-tilt", `${tilt}deg`);
  };

  const handleButtonClick = (pageId) => {
    if (suppressClickRef.current) {
      return;
    }

    onNavigate(pageId);
  };

  return (
    <nav
      ref={navRef}
      className={`bottom-nav${
        liquidGlassEnabled ? " bottom-nav-liquid-glass" : ""
      }`}
      aria-label="Alt menü"
      data-dragging="false"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={(event) => finishDrag(event, true)}
    >
      {BOTTOM_NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={activePage === item.id ? "bottom-nav-active" : ""}
          aria-current={activePage === item.id ? "page" : undefined}
          onClick={() => handleButtonClick(item.id)}
        >
          <span>
            <AppIcon name={activePage === item.id ? item.activeIcon : item.icon} />
          </span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function createDiscoveryScreenId(type) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
