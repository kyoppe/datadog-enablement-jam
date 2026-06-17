// Clipboard helper with a fallback for non-secure contexts.
//
// navigator.clipboard is only available in secure contexts (HTTPS or
// localhost). When the app is opened over plain HTTP via a LAN IP
// (e.g. http://10.43.130.67:3000), navigator.clipboard is undefined and the
// copy buttons would throw "Cannot read properties of undefined (reading
// 'writeText')". We fall back to a temporary <textarea> + execCommand("copy").
export async function copyText(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Keep it out of view and avoid scrolling/zoom on mobile.
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.setAttribute("readonly", "");
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
