import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppIcon from "./AppIcon.jsx";

const ONBOARDING_VERSION = 1;
const STORAGE_KEY_PREFIX = "bizim-mekanlar:onboarding";
const PILL_EDGE_PADDING = 12;
const PILL_DRAG_THRESHOLD = 6;

function getStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}:v${ONBOARDING_VERSION}:${Number(userId) || "anonymous"}`;
}

function createDefaultState() {
  return {
    activeStepId: "",
    collapsed: false,
    dismissed: false,
    finished: false,
    completed: {},
    pillPosition: null,
  };
}

function normalizePillPosition(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);

  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function readState(userId) {
  if (typeof window === "undefined" || !userId) {
    return createDefaultState();
  }

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(userId));
    const parsedValue = rawValue ? JSON.parse(rawValue) : null;

    return {
      ...createDefaultState(),
      ...parsedValue,
      activeStepId: String(parsedValue?.activeStepId ?? ""),
      completed: {
        ...createDefaultState().completed,
        ...(parsedValue?.completed || {}),
      },
      pillPosition: normalizePillPosition(parsedValue?.pillPosition),
    };
  } catch {
    return createDefaultState();
  }
}

function writeState(userId, nextState) {
  if (typeof window === "undefined" || !userId) {
    return;
  }

  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(nextState));
  } catch {
    // Onboarding state is a UX convenience; storage failures must not block the app.
  }
}

function getProfileBasicsComplete(profile) {
  return Boolean(
    String(profile?.FirstName ?? "").trim() ||
      String(profile?.LastName ?? "").trim() ||
      Number(profile?.CityId) > 0 ||
      String(profile?.ProfilePhotoPath ?? "").trim()
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getClampedPillPosition({ x, y, width, height }) {
  const viewportWidth = Math.max(1, window.innerWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || 1);

  return {
    x: clamp(x, PILL_EDGE_PADDING, Math.max(PILL_EDGE_PADDING, viewportWidth - width - PILL_EDGE_PADDING)),
    y: clamp(y, PILL_EDGE_PADDING, Math.max(PILL_EDGE_PADDING, viewportHeight - height - PILL_EDGE_PADDING)),
  };
}

export default function OnboardingCoach({
  profile,
  summary,
  activePage,
  hasDiscoveryScreen = false,
  placeSavedSignal = 0,
  onEditProfile,
  onNavigate,
  onOpenUserSearch,
}) {
  const userId = Number(profile?.UserId) || null;
  const [state, setState] = useState(() => readState(userId));
  const pillDragRef = useRef(null);
  const suppressNextPillClickRef = useRef(false);

  useEffect(() => {
    setState(readState(userId));
  }, [userId]);

  useEffect(() => {
    writeState(userId, state);
  }, [state, userId]);

  const markStepComplete = useCallback((stepId) => {
    if (!stepId) {
      return;
    }

    setState((currentState) => {
      if (currentState.completed?.[stepId]) {
        return currentState;
      }

      return {
        ...currentState,
        completed: {
          ...(currentState.completed || {}),
          [stepId]: true,
        },
      };
    });
  }, []);

  const unmarkStepComplete = useCallback((stepId) => {
    if (!stepId) {
      return;
    }

    setState((currentState) => {
      if (!currentState.completed?.[stepId]) {
        return currentState;
      }

      const nextCompleted = { ...(currentState.completed || {}) };
      delete nextCompleted[stepId];

      return {
        ...currentState,
        completed: nextCompleted,
      };
    });
  }, []);

  const setActiveStepId = useCallback((stepId) => {
    setState((currentState) => ({
      ...currentState,
      activeStepId: stepId,
    }));
  }, []);

  const hasProfileBasics = getProfileBasicsComplete(profile);
  const noteCount = Number(summary?.NoteCount ?? 0);

  useEffect(() => {
    if (hasProfileBasics) {
      markStepComplete("profile");
    }
  }, [hasProfileBasics, markStepComplete]);

  useEffect(() => {
    if (noteCount > 0) {
      markStepComplete("note");
    }
  }, [markStepComplete, noteCount]);

  useEffect(() => {
    if (Number(placeSavedSignal) > 0) {
      markStepComplete("save");
    }
  }, [markStepComplete, placeSavedSignal]);

  useEffect(() => {
    if (activePage === "list") {
      markStepComplete("feed");
    }
  }, [activePage, markStepComplete]);

  const steps = useMemo(
    () => [
      {
        id: "profile",
        icon: "user",
        title: "Profilini tamamla",
        description:
          "Şehir, isim veya fotoğraf ekleyerek profilini daha güvenilir göster.",
        complete: Boolean(state.completed?.profile || hasProfileBasics),
        autoComplete: Boolean(hasProfileBasics),
        actionLabel: "Profili düzenle",
        action: () => onEditProfile?.(),
      },
      {
        id: "note",
        icon: "pencil-simple-line",
        title: "İlk mekan notunu bırak",
        description:
          "Haritada bir mekan ara, puanını ve kısa notunu ekle. Uygulama asıl burada canlanıyor.",
        complete: Boolean(state.completed?.note || noteCount > 0),
        autoComplete: Boolean(noteCount > 0),
        actionLabel: "Haritada başla",
        action: () => onNavigate?.("map"),
      },
      {
        id: "save",
        icon: "bookmark-simple",
        title: "Gitmek İstiyorum listen başlasın",
        description:
          "Beğendiğin veya sonra denemek istediğin bir mekanı listeye kaydet.",
        complete: Boolean(state.completed?.save),
        autoComplete: false,
        actionLabel: "Mekan ara",
        action: () => onNavigate?.("map"),
      },
      {
        id: "feed",
        icon: "list-bullets",
        title: "Akışı keşfet",
        description:
          "Takip ettiklerinin ve görünür notların nasıl aktığını gör.",
        complete: Boolean(state.completed?.feed || activePage === "list"),
        autoComplete: activePage === "list",
        actionLabel: "Akışa git",
        action: () => {
          markStepComplete("feed");
          onNavigate?.("list");
        },
      },
      {
        id: "social",
        icon: "user-circle-plus",
        title: "Birini bul ve takip et",
        description:
          "Kullanıcı aramadan arkadaşlarını bul; sosyal harita zamanla daha anlamlı hale gelir.",
        complete: Boolean(state.completed?.social),
        autoComplete: false,
        actionLabel: "Kullanıcı ara",
        action: () => {
          markStepComplete("social");
          onOpenUserSearch?.();
        },
      },
    ],
    [
      activePage,
      hasProfileBasics,
      markStepComplete,
      noteCount,
      onEditProfile,
      onNavigate,
      onOpenUserSearch,
      state.completed,
    ]
  );

  const completedCount = steps.filter((step) => step.complete).length;
  const totalCount = steps.length;
  const allStepsComplete = totalCount > 0 && completedCount === totalCount;
  const firstIncompleteStep = steps.find((step) => !step.complete) || steps[0];
  const activeStep =
    steps.find((step) => step.id === state.activeStepId) || firstIncompleteStep;
  const activeStepIndex = Math.max(0, steps.findIndex((step) => step.id === activeStep?.id));
  const canUndoActiveStep = Boolean(state.completed?.[activeStep?.id]) && !activeStep?.autoComplete;
  const pillPosition = normalizePillPosition(state.pillPosition);
  const pillPositionStyle = pillPosition
    ? {
        bottom: "auto",
        left: `${pillPosition.x}px`,
        right: "auto",
        top: `${pillPosition.y}px`,
      }
    : undefined;

  const openCoach = useCallback(() => {
    setState((currentState) => ({
      ...currentState,
      collapsed: false,
      dismissed: false,
      finished: false,
      activeStepId: currentState.activeStepId || firstIncompleteStep?.id || "profile",
    }));
  }, [firstIncompleteStep?.id]);

  const handlePillPointerDown = useCallback((event) => {
    if (event.button != null && event.button !== 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    pillDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const handlePillPointerMove = useCallback((event) => {
    const dragState = pillDragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (!dragState.moved && Math.hypot(deltaX, deltaY) < PILL_DRAG_THRESHOLD) {
      return;
    }

    dragState.moved = true;
    suppressNextPillClickRef.current = true;
    event.preventDefault();

    const nextPosition = getClampedPillPosition({
      x: dragState.originX + deltaX,
      y: dragState.originY + deltaY,
      width: dragState.width,
      height: dragState.height,
    });

    setState((currentState) => ({
      ...currentState,
      pillPosition: nextPosition,
    }));
  }, []);

  const handlePillPointerUp = useCallback((event) => {
    const dragState = pillDragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    pillDragRef.current = null;
  }, []);

  const handlePillClick = useCallback((event) => {
    if (suppressNextPillClickRef.current) {
      event.preventDefault();
      suppressNextPillClickRef.current = false;
      return;
    }

    openCoach();
  }, [openCoach]);

  useEffect(() => {
    if (!pillPosition) {
      return undefined;
    }

    const keepPillInViewport = () => {
      setState((currentState) => {
        const currentPosition = normalizePillPosition(currentState.pillPosition);

        if (!currentPosition) {
          return currentState;
        }

        const nextPosition = getClampedPillPosition({
          x: currentPosition.x,
          y: currentPosition.y,
          width: 164,
          height: 48,
        });

        if (nextPosition.x === currentPosition.x && nextPosition.y === currentPosition.y) {
          return currentState;
        }

        return {
          ...currentState,
          pillPosition: nextPosition,
        };
      });
    };

    window.addEventListener("resize", keepPillInViewport);
    window.addEventListener("orientationchange", keepPillInViewport);

    return () => {
      window.removeEventListener("resize", keepPillInViewport);
      window.removeEventListener("orientationchange", keepPillInViewport);
    };
  }, [pillPosition]);

  if (!userId || hasDiscoveryScreen || state.finished) {
    return null;
  }

  if (state.dismissed) {
    return (
      <button
        className="onboarding-reopen-tab"
        type="button"
        onClick={openCoach}
        aria-label="Başlangıç rehberini yeniden aç"
        title="Başlangıç rehberini yeniden aç"
      >
        <AppIcon name="map-trifold" />
        <span>Rehber</span>
      </button>
    );
  }

  if (state.collapsed) {
    return (
      <button
        className="onboarding-pill"
        type="button"
        style={pillPositionStyle}
        onClick={handlePillClick}
        onPointerDown={handlePillPointerDown}
        onPointerMove={handlePillPointerMove}
        onPointerUp={handlePillPointerUp}
        onPointerCancel={handlePillPointerUp}
        aria-label="Başlangıç rehberini aç"
        title="Sürükleyerek taşıyabilirsin"
      >
        <span className="onboarding-pill-icon" aria-hidden="true">
          <AppIcon name="map-trifold" />
        </span>
        <span>Başlangıç</span>
        <strong>{completedCount}/{totalCount}</strong>
      </button>
    );
  }

  const previousStep = steps[activeStepIndex - 1] || null;
  const nextStep = steps[activeStepIndex + 1] || null;
  return (
    <aside className="onboarding-coach" aria-label="Başlangıç rehberi">
      <div className="onboarding-coach-header">
        <div>
          <p className="onboarding-eyebrow">Başlangıç rehberi</p>
          <h2>{activeStep.title}</h2>
        </div>

        <div className="onboarding-progress" aria-label={`${completedCount}/${totalCount} tamamlandı`}>
          <span>{completedCount}</span>
          <small>/{totalCount}</small>
        </div>
      </div>

      <p className="onboarding-copy">{activeStep.description}</p>

      {allStepsComplete && (
        <div className="onboarding-complete-banner" role="status">
          <AppIcon name="check" />
          <span>Başlangıç rehberi tamamlandı. Adımları tekrar kontrol edebilir veya rehberi bitirebilirsin.</span>
        </div>
      )}

      <div className="onboarding-step-list" aria-label="Onboarding adımları">
        {steps.map((step, index) => (
          <button
            className={`onboarding-step-chip${
              step.complete ? " onboarding-step-chip-done" : ""
            }${step.id === activeStep.id ? " onboarding-step-chip-current" : ""}`}
            key={step.id}
            type="button"
            onClick={() => setActiveStepId(step.id)}
            title={step.title}
            aria-label={`${index + 1}. adım: ${step.title}${step.complete ? ", tamamlandı" : ""}`}
            aria-current={step.id === activeStep.id ? "step" : undefined}
          >
            <AppIcon name={step.complete ? "check" : step.icon} />
          </button>
        ))}
      </div>

      <div className="onboarding-step-controls" aria-label="Adımlar arasında gezin">
        <button
          type="button"
          onClick={() => previousStep && setActiveStepId(previousStep.id)}
          disabled={!previousStep}
        >
          Önceki
        </button>
        <span>{activeStepIndex + 1}. adım</span>
        <button
          type="button"
          onClick={() => nextStep && setActiveStepId(nextStep.id)}
          disabled={!nextStep}
        >
          Sonraki
        </button>
      </div>

      <div className="onboarding-actions">
        <button
          className="primary-button onboarding-primary-action"
          type="button"
          onClick={activeStep.action}
        >
          {activeStep.actionLabel}
        </button>

        {!activeStep.complete && (
          <button
            className="secondary-button onboarding-secondary-action"
            type="button"
            onClick={() => markStepComplete(activeStep.id)}
          >
            Bunu yaptım
          </button>
        )}

        {activeStep.complete && canUndoActiveStep && (
          <button
            className="secondary-button onboarding-secondary-action"
            type="button"
            onClick={() => unmarkStepComplete(activeStep.id)}
          >
            İşareti kaldır
          </button>
        )}

        {activeStep.complete && !canUndoActiveStep && (
          <button
            className="secondary-button onboarding-secondary-action"
            type="button"
            disabled
          >
            Tamamlandı
          </button>
        )}
      </div>

      <div className="onboarding-footer-actions">
        <button
          type="button"
          onClick={() =>
            setState((currentState) => ({
              ...currentState,
              collapsed: true,
              dismissed: false,
            }))
          }
        >
          Küçült
        </button>
        <button
          type="button"
          onClick={() =>
            setState((currentState) => ({
              ...currentState,
              collapsed: false,
              dismissed: true,
            }))
          }
        >
          Kapat
        </button>
        {allStepsComplete && (
          <button
            className="onboarding-finish-action"
            type="button"
            onClick={() =>
              setState((currentState) => ({
                ...currentState,
                collapsed: false,
                dismissed: false,
                finished: true,
              }))
            }
          >
            Rehberi bitir
          </button>
        )}
      </div>
    </aside>
  );
}
