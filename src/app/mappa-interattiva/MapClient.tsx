"use client";

import dynamic from "next/dynamic";
import type { House, MapFeature, MapSettings } from "./map-types";

// Leaflet usa la finestra del browser: la mappa si disegna solo nel browser
const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <p className="flex min-h-dvh items-center justify-center text-muted">Caricamento della mappa...</p>,
});

export default function MapClient(props: {
  canEdit: boolean;
  settings: MapSettings;
  features: MapFeature[];
  houses: House[];
}) {
  return <MapCanvas {...props} />;
}
