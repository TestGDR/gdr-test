"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyGameSettings, getSettings, type GameSettings } from "./settings";

// Regole di salute, fatica e peso salvate dallo staff (lette una volta per
// pagina): finche' non arrivano valgono quelle del regolamento
let cache: Promise<GameSettings> | null = null;

export function useGameSettings(): GameSettings {
  const [settings, setLocal] = useState<GameSettings>(getSettings);
  useEffect(() => {
    cache ??= applyGameSettings(createClient());
    cache.then(setLocal);
  }, []);
  return settings;
}

// Dopo una modifica dal pannello: alla prossima lettura si ricaricano
export function resetGameSettingsCache() {
  cache = null;
}
