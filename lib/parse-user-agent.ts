// Lightweight, good-enough device/browser summary for a login journal — not
// meant to be a precise UA parser, just enough for "oh, that's not my
// phone" at a glance.
export function summarizeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Nieznane urządzenie";

  const ua = userAgent;

  let device = "Komputer";
  if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua)) device = "iPad";
  else if (/Android/i.test(ua)) device = /Mobile/i.test(ua) ? "Telefon Android" : "Tablet Android";
  else if (/Macintosh/i.test(ua)) device = "Mac";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/Linux/i.test(ua)) device = "Linux";

  let browser = "";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/CriOS\//i.test(ua)) browser = "Chrome";
  else if (/FxiOS\//i.test(ua) || /Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  return browser ? `${device} · ${browser}` : device;
}
