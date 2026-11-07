"use client";

import { useEffect } from "react";

// Registra il service worker (public/sw.js): rende il sito installabile come app
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // senza service worker il sito funziona lo stesso, solo non si installa
    });
  }, []);
  return null;
}
