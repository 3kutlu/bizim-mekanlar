import AppIcon from "./AppIcon.jsx";

export default function PushNotificationPrompt({
  isBusy = false,
  feedback = "",
  onEnable,
  onLater,
}) {
  return (
    <section
      className="push-permission-prompt"
      role="dialog"
      aria-modal="false"
      aria-labelledby="push-permission-prompt-title"
    >
      <div className="push-permission-prompt-icon" aria-hidden="true">
        <AppIcon name="bell-ringing" />
      </div>

      <div className="push-permission-prompt-copy">
        <p className="eyebrow">BİLDİRİMLER</p>
        <h2 id="push-permission-prompt-title">Gelişmeleri kaçırma</h2>
        <p>
          Takip istekleri, takip ettiklerinin notları ve notuna gelen
          tepkiler için bildirim al.
        </p>
        {feedback && (
          <p className="push-permission-prompt-feedback" role="status">
            {feedback}
          </p>
        )}
      </div>

      <div className="push-permission-prompt-actions">
        <button
          className="push-permission-prompt-later"
          type="button"
          disabled={isBusy}
          onClick={onLater}
        >
          Şimdi değil
        </button>
        <button
          className="push-permission-prompt-enable"
          type="button"
          disabled={isBusy}
          onClick={onEnable}
        >
          {isBusy ? "Açılıyor..." : "Bildirimleri aç"}
        </button>
      </div>
    </section>
  );
}
