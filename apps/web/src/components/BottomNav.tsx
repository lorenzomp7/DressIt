"use client";

import { Camera, Shirt, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCleanPathname } from "@/lib/path";

const LINKS = [
  { href: "/", label: "Armadio", icon: Shirt },
  { href: "/add", label: "Aggiungi", icon: Camera },
  { href: "/assistant", label: "Stylist", icon: Sparkles },
];

export function BottomNav() {
  const pathname = useCleanPathname();
  if (pathname === "/login") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-3">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" || pathname.startsWith("/item") : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-3 text-xs font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon className="size-6" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
