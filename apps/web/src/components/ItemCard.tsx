import Link from "next/link";
import type { Item } from "@/lib/types";

export function ItemCard({ item }: { item: Item }) {
  return (
    <Link
      href={`/item?id=${item.id}`}
      className="group overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line transition active:scale-[0.98]"
    >
      <div className="aspect-[3/4] overflow-hidden bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element -- images come from Cloudinary/API, already optimised */}
        <img
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          className="size-full object-cover transition group-hover:scale-105"
        />
      </div>
      <div className="p-2.5">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="truncate text-xs text-muted">{item.colors.slice(0, 2).join(", ")}</p>
      </div>
    </Link>
  );
}
