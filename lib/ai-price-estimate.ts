import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBrandSalesHistory } from "@/lib/sales-history";
import { downloadPhotoAsBase64 } from "@/lib/item-photo-download";
import { formatPln } from "@/lib/format";

type EstimateResult = {
  model: string;
  suggestedPrice: number;
  priceReasoning: string;
};

// Stage 1 of the two-stage AI evaluation: a fast, rough estimate run right
// at intake off the working photo(s) + condition the employee just typed
// in, so model + price show up on the item page immediately instead of
// waiting for final photos and the full listing-copy pass. Stage 2 is
// generateAiCard() in app/items/[id]/ai-card.ts, which re-checks with the
// final photos before publishing and calls out any meaningful change.
export async function generateIntakeEstimate(itemId: string) {
  const { data: item } = await supabaseAdmin
    .from("items")
    .select("brand, size, condition, condition_detail, defects, price")
    .eq("id", itemId)
    .single();

  if (!item) return;

  const { data: photos } = await supabaseAdmin
    .from("item_photos")
    .select("storage_path")
    .eq("item_id", itemId)
    .eq("is_working_photo", true)
    .order("sort_order", { ascending: true })
    .limit(4);

  if (!photos || photos.length === 0) return;

  const images = await Promise.all(
    photos.map((photo) => downloadPhotoAsBase64(photo.storage_path))
  );

  const defectsText = item.defects?.length ? item.defects.join(", ") : "brak wad";

  const history = await getBrandSalesHistory(item.brand);
  const historyText = history
    ? `Historia sprzedaży tej marki w naszym sklepie: ${history.count} sprzedanych par, średnia cena ${formatPln(history.avgPrice)} (zakres ${formatPln(history.minPrice)}–${formatPln(history.maxPrice)}).`
    : "Brak historii sprzedaży tej marki w naszym sklepie.";

  const promptText = `Jesteś ekspertem od sprzedaży używanych butów na polskich platformach ogłoszeniowych. To jest szybka, wstępna wycena zaraz po przyjęciu towaru — zdjęcie robocze, nie finalne.
Dane:
- Marka: ${item.brand ?? "nieznana"}
- Rozmiar: ${item.size ?? "nieznany"}
- Stan: ${item.condition ?? "nieznany"}${item.condition_detail ? ` (${item.condition_detail})` : ""}
- Wady: ${defectsText}
- ${historyText}

Na podstawie zdjęcia roboczego rozpoznaj model butów i zaproponuj wstępną cenę sprzedaży (suggestedPrice, w złotych) z krótkim uzasadnieniem (priceReasoning, 1-2 zdania). To wstępna wycena — zostanie ponownie sprawdzona przed publikacją, gdy będą zdjęcia finalne.

Odpowiedz wyłącznie przez wywołanie narzędzia submit_price_estimate.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    tool_choice: { type: "tool", name: "submit_price_estimate" },
    tools: [
      {
        name: "submit_price_estimate",
        description: "Zapisuje wstępnie rozpoznany model butów oraz sugerowaną cenę.",
        input_schema: {
          type: "object",
          properties: {
            model: { type: "string", description: "Rozpoznany model butów" },
            suggestedPrice: { type: "number", description: "Sugerowana cena sprzedaży w złotych" },
            priceReasoning: { type: "string", description: "Krótkie uzasadnienie sugerowanej ceny" },
          },
          required: ["model", "suggestedPrice", "priceReasoning"],
        },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          ...images.map((image) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: image.mediaType as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
              data: image.base64,
            },
          })),
        ],
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) return;

  const result = toolUse.input as EstimateResult;

  await supabaseAdmin
    .from("items")
    .update({
      model: result.model,
      ai_suggested_price: result.suggestedPrice ?? null,
      ai_price_reasoning: result.priceReasoning
        ? `Wstępna wycena przy przyjęciu: ${result.priceReasoning}`
        : null,
    })
    .eq("id", itemId);
}
