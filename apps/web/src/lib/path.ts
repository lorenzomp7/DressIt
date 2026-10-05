import { usePathname } from "next/navigation";

/** Pathname without the trailing slash added by the static export (`/login/` → `/login`). */
export function useCleanPathname(): string {
  const pathname = usePathname() ?? "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}
