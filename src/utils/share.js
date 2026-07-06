function fallbackCopyText(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand("copy");
  textarea.remove();

  return copied;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  return fallbackCopyText(value);
}

export async function shareOrCopyLink({ title, text, url }) {
  const payload = {
    title: String(title ?? "Bizim Mekanlar"),
    text: String(text ?? ""),
    url: String(url ?? ""),
  };

  if (!payload.url) {
    return { status: "error" };
  }

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return { status: "shared" };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { status: "cancelled" };
      }
      // Bazı tarayıcılar share'i destekliyor görünür ama bir share target sunmuyor.
      // Bu durumda linki kopyalamayı deniyoruz.
    }
  }

  try {
    const copied = await copyText(payload.url);
    return { status: copied ? "copied" : "error" };
  } catch (error) {
    console.error("Bağlantı kopyalanamadı:", error);
    return { status: "error" };
  }
}
