"use client";

import { useEffect, useState } from "react";
import { env } from "@/env";

/**
 * Registers the lightweight service worker in production only, so that dev
 * caches never interfere with Turbopack HMR.
 */
export function ServiceWorkerRegistrar() {
  const [enabled] = useState(() => env.NEXT_PUBLIC_NODE_ENV === "production");

  useEffect(() => {
    if (!enabled) return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure must never break the page.
      });
    };
    register();
  }, [enabled]);

  return null;
}
