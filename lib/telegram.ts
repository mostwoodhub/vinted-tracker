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
