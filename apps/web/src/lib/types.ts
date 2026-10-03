export type Category = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory" | "bag";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Formality = "sport" | "casual" | "smart_casual" | "business" | "formal";

export interface Item {
  id: string;
  imageUrl: string;
  name: string;
  category: Category;
  subcategory: string;
  colors: string[];
  pattern: string;
  material: string;
  seasons: Season[];
  formality: Formality;
  warmth: number;
  tags: string[];
  description: string;
  lastWornAt: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
}

export interface Weather {
  description: string;
  temperatureC: number;
  feelsLikeC: number;
  minC: number;
  maxC: number;
  precipitationProbability: number;
  windKmh: number;
}

export interface Outfit {
  title: string;
  explanation: string;
  missingPiece: string | null;
  items: Item[];
}

export interface OutfitSuggestion {
  reply: string;
  outfits: Outfit[];
  weather: Weather | null;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Sopra",
  bottom: "Sotto",
  dress: "Abiti",
  outerwear: "Capispalla",
  shoes: "Scarpe",
  accessory: "Accessori",
  bag: "Borse",
};

export const SEASON_LABELS: Record<Season, string> = {
  spring: "Primavera",
  summer: "Estate",
  autumn: "Autunno",
  winter: "Inverno",
};

export const FORMALITY_LABELS: Record<Formality, string> = {
  sport: "Sportivo",
  casual: "Casual",
  smart_casual: "Smart casual",
  business: "Business",
  formal: "Elegante",
};
