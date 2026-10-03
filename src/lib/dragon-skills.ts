"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Abilita' dei draghi: le decide lo staff (Gestione -> Draghi -> Abilita').
// Si caricano una volta sola e si condividono tra tutti i componenti.
export type DragonSkill = { key: string; label: string; sort_order: number };

let cache: Promise<DragonSkill[]> | null = null;

function load() {
  cache ??= Promise.resolve(
    createClient()
      .from("dragon_skills")
      .select("*")
      .order("sort_order")
      .order("label")
      .then(({ data }) => (data ?? []) as DragonSkill[]),
  );
  return cache;
}

// Dopo una modifica dello staff: la prossima lettura ricarica l'elenco
export function invalidateDragonSkills() {
  cache = null;
}

export function useDragonSkills() {
  const [skills, setSkills] = useState<DragonSkill[]>([]);
  useEffect(() => {
    let alive = true;
    load().then((s) => alive && setSkills(s));
    return () => {
      alive = false;
    };
  }, []);
  return skills;
}
