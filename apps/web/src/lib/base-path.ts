/**
 * Sub-path the app is served from ("" locally, "/DressIt" on GitHub Pages).
 * Next adds it to <Link> and router calls by itself; plain URLs (icons, manifest, service worker) need it.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** Prefixes a root-relative path with BASE_PATH: withBase("/icons/a.png") → "/DressIt/icons/a.png". */
export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}

