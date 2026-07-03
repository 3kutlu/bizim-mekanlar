export default function ShareIconButton({
  onClick,
  disabled = false,
  label = "Paylaş",
  className = "",
}) {
  return (
    <button
      className={`share-icon-button${className ? ` ${className}` : ""}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">↗</span>
    </button>
  );
}
