import "server-only";

// Reads credentials from env vars only — TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_ID must be set in Vercel project settings, never committed
// to the repo. Silently no-ops if either is missing, so this never blocks
// the sale flow itself (e.g. in local dev, or before the vars are set).
export async function sendTelegramMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Telegram: brak TELEGRAM_BOT_TOKEN lub TELEGRAM_CHAT_ID — pominięto powiadomienie");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });

    if (!res.ok) {
      console.error("Telegram: nie udało się wysłać wiadomości", await res.text());
    }
  } catch (err) {
    console.error("Telegram: błąd wysyłki", err);
  }
}

// Telegram fetches the photo itself from `photoUrl` — no need to download
// and re-upload it ourselves — so this only works for a publicly reachable
// URL (Supabase Storage public URLs qualify). Falls back to a plain text
// message on any failure (bad/unreachable URL, oversized image, etc.) so a
// photo problem never means the sale notification is silently lost.
export async function sendTelegramPhoto(photoUrl: string, caption: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Telegram: brak TELEGRAM_BOT_TOKEN lub TELEGRAM_CHAT_ID — pominięto powiadomienie");
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML" }),
    });

    if (!res.ok) {
      console.error("Telegram: nie udało się wysłać zdjęcia, wysyłam tekst", await res.text());
      await sendTelegramMessage(caption);
    }
  } catch (err) {
    console.error("Telegram: błąd wysyłki zdjęcia, wysyłam tekst", err);
    await sendTelegramMessage(caption);
  }
}
