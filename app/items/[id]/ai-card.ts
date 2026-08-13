import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PLATFORM_LIMITS = {
  vinted: { title: 70, description: 1000 },
  allegro: { title: 50, description: 2000 },
  olx: { title: 70, description: 4000 },
} as const;

type PlatformKey = keyof typeof PLATFORM_LIMITS;

type ListingCopy = { title: string; description: string };

type ListingResult = {
  model: string;
  vinted: ListingCopy;
  allegro: ListingCopy;
  olx: ListingCopy;
};

async function downloadPhotoAsBase64(path: string) {
  const { data, error } = await supabaseAdmin.storage
    .from("item-photos")
    .download(path);

  if (error || !data) {
    throw error ?? new Error(`Nie udało się pobrać zdjęcia: ${path}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const mediaType = data.type || "image/jpeg";

  return { mediaType, base64: buffer.toString("base64") };
}

export async function generateAiCard(itemId: string) {
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
    .eq("is_working_photo", false)
    .order("uploaded_at", { ascending: true })
    .limit(8);

  if (!photos || photos.length === 0) return;

  const images = await Promise.all(
    photos.map((photo) => downloadPhotoAsBase64(photo.storage_path))
  );

  const defectsText = item.defects?.length
    ? item.defects.join(", ")
    : "brak wad";

  const promptText = `Jesteś ekspertem od sprzedaży używanych butów na polskich platformach ogłoszeniowych.
Na podstawie zdjęć oraz poniższych danych:
- Marka: ${item.brand ?? "nieznana"}
- Rozmiar: ${item.size ?? "nieznany"}
- Stan: ${item.condition ?? "nieznany"}${item.condition_detail ? ` (${item.condition_detail})` : ""}
- Wady: ${defectsText}

Zidentyfikuj dokładny model butów na podstawie zdjęć, a następnie wygeneruj tytuł i opis ogłoszenia osobno dla trzech platform, ściśle przestrzegając limitów znaków:
- Vinted: tytuł do ${PLATFORM_LIMITS.vinted.title} znaków, opis do ${PLATFORM_LIMITS.vinted.description} znaków
- Allegro: tytuł do ${PLATFORM_LIMITS.allegro.title} znaków, opis do ${PLATFORM_LIMITS.allegro.description} znaków
- OLX: tytuł do ${PLATFORM_LIMITS.olx.title} znaków, opis do ${PLATFORM_LIMITS.olx.description} znaków

Odpowiedz wyłącznie przez wywołanie narzędzia submit_listing_data.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    tool_choice: { type: "tool", name: "submit_listing_data" },
    tools: [
      {
        name: "submit_listing_data",
        description:
          "Zapisuje rozpoznany model butów oraz treści ogłoszeń dla Vinted, Allegro i OLX.",
        input_schema: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "Rozpoznany model butów",
            },
            vinted: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
              },
              required: ["title", "description"],
            },
            allegro: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
              },
              required: ["title", "description"],
            },
            olx: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
              },
              required: ["title", "description"],
            },
          },
          required: ["model", "vinted", "allegro", "olx"],
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

  if (!toolUse) throw new Error("Brak odpowiedzi narzędzia od modelu");

  const result = toolUse.input as ListingResult;
  const platforms: PlatformKey[] = ["vinted", "allegro", "olx"];

  for (const platform of platforms) {
    const listing = result[platform];
    const limits = PLATFORM_LIMITS[platform];

    await supabaseAdmin.from("marketplace_listings").insert({
      item_id: itemId,
      platform,
      title: listing.title.slice(0, limits.title),
      description: listing.description.slice(0, limits.description),
      price: item.price,
      status: "draft",
    });
  }

  await supabaseAdmin
    .from("items")
    .update({ status: "ai_card_ready", model: result.model })
    .eq("id", itemId);

  await supabaseAdmin.from("item_status_log").insert({
    item_id: itemId,
    from_status: "photos_uploaded",
    to_status: "ai_card_ready",
  });
}
