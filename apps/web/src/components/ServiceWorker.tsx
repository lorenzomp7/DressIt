"use client";

import { useEffect } from "react";
import { withBase } from "@/lib/base-path";

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(withBase("/sw.js")).catch(() => {
      /* PWA features are progressive: the app works without them */
    });
  }, []);
  return null;
}
