import type { AdminItem, AdminStats, AdminUser, Item, OutfitSuggestion, User, Weather } from "./types";

// Inlined at build time. Render passes just the host (fromService.property: host).
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const API_URL = (/^https?:\/\//.test(RAW_API_URL) ? RAW_API_URL : `https://${RAW_API_URL}`).replace(
  /\/$/,
  "",
);

const TOKEN_KEY = "dressit.token";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: session lasts until reload */
    }
  },
};

/** Called on 401 so the UI can redirect to login. Set by AuthProvider. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Impossibile contattare il server. Controlla la connessione.", 0);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(data.error ?? `Errore ${res.status}`, res.status);
  }
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  register: (email: string, password: string, displayName?: string) =>
    request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: json({ email, password, displayName }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: json({ email, password }),
    }),
  me: () => request<{ user: User }>("/auth/me"),

  listItems: () => request<{ items: Item[] }>("/items").then((r) => r.items),
  getItem: (id: string) => request<{ item: Item }>(`/items/${id}`).then((r) => r.item),
  uploadItem: (file: Blob, filename = "capo.jpg") => {
    const form = new FormData();
    form.append("image", file, filename);
    return request<{ item: Item }>("/items", { method: "POST", body: form }).then((r) => r.item);
  },
  updateItem: (id: string, patch: Partial<Item>) =>
    request<{ item: Item }>(`/items/${id}`, { method: "PATCH", body: json(patch) }).then((r) => r.item),
  deleteItem: (id: string) => request<void>(`/items/${id}`, { method: "DELETE" }),
  markWorn: (itemIds: string[]) =>
    request<{ updated: number }>("/items/wear", { method: "POST", body: json({ itemIds }) }),

  weather: (lat: number, lon: number) =>
    request<{ weather: Weather }>(`/weather?lat=${lat}&lon=${lon}`).then((r) => r.weather),
  suggest: (body: {
    message: string;
    history: { role: "user" | "assistant"; content: string }[];
    location?: { lat: number; lon: number };
    timezone: string;
  }) => request<OutfitSuggestion>("/outfits/suggest", { method: "POST", body: json(body) }),

  admin: {
    stats: () => request<AdminStats>("/admin/stats"),
    users: () => request<{ users: AdminUser[] }>("/admin/users").then((r) => r.users),
    items: (userId?: string) =>
      request<{ items: AdminItem[] }>(`/admin/items?limit=60${userId ? `&userId=${userId}` : ""}`).then(
        (r) => r.items,
      ),
    deleteUser: (id: string) => request<void>(`/admin/users/${id}`, { method: "DELETE" }),
  },
};
