import type { Item } from "../domain.js";
import { trackAi } from "../repositories/aiEvents.js";
import { listItems } from "../repositories/items.js";
import { listWearHistory } from "../repositories/wearHistory.js";
import { suggestOutfits } from "./ai.js";
import { getWeather, type WeatherSummary } from "./weather.js";

export interface StylistRequest {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  location?: { lat: number; lon: number };
  timezone: string;
}

export interface SuggestedOutfit {
  title: string;
  explanation: string;
  missingPiece: string | null;
  items: Item[];
}

export interface StylistResult {
  reply: string;
  outfits: SuggestedOutfit[];
  weather: WeatherSummary | null;
}

/**
 * The stylist for one user, shared by POST /outfits/suggest and the MCP tool suggest_outfit:
 * wardrobe, wear memory and weather → Gemini → outfits made only of the user's own garments.
 * AiError from the model propagates to the caller.
 */
export async function suggestForUser(userId: string, req: StylistRequest): Promise<StylistResult> {
  const wardrobe = await listItems(userId);
  if (wardrobe.length === 0) {
    return {
      reply: "Il tuo guardaroba è ancora vuoto! Fotografa qualche capo e poi chiedimi un outfit.",
      outfits: [],
      weather: null,
    };
  }

  // Keep the most recent turns, and make sure the conversation starts with a user turn.
  let history = req.history.slice(-12);
  while (history[0]?.role === "assistant") history = history.slice(1);

  const wearHistory = await listWearHistory(userId);
  const weather = req.location ? await getWeather(req.location.lat, req.location.lon) : null;

  const result = await trackAi(userId, "outfit", () =>
    suggestOutfits({ message: req.message, history, wardrobe, weather, timezone: req.timezone, wearHistory }),
  );

  // Never trust IDs coming back from the model: keep only items the user owns.
  const byId = new Map(wardrobe.map((i) => [i.id, i]));
  const outfits = result.outfits
    .map((o) => ({
      title: o.title,
      explanation: o.explanation,
      missingPiece: o.missing_piece || null,
      items: [...new Set(o.item_ids)].flatMap((id) => byId.get(id) ?? []),
    }))
    .filter((o) => o.items.length > 0)
    .slice(0, 3);

  return { reply: result.reply, outfits, weather };
}
