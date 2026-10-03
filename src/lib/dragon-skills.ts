"use client";

import { useEffect, useState } from "react";
import type { TraitEffect } from "@/lib/dragons";
import { createClient } from "@/lib/supabase/client";

// Abilita' dei draghi: le decide lo staff (Gestione -> Draghi -> Abilita').
// Si caricano una volta sola e si condividono tra tutti i componenti.
export type DragonSkill = {
  key: string;
  label: string;
  sort_order: number;
  stat_key: string; // caratteristica di riferimento (vigore, destrezza, intelletto, percezione)
};

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

// Effetti di pregi e difetti (stesso meccanismo: caricati una volta e condivisi)
let effectsCache: Promise<TraitEffect[]> | null = null;

export function invalidateDragonEffects() {
  effectsCache = null;
}

export function useDragonEffects() {
  const [effects, setEffects] = useState<TraitEffect[]>([]);
  useEffect(() => {
    let alive = true;
    effectsCache ??= Promise.resolve(
      createClient()
        .from("dragon_trait_effects")
        .select("*")
        .order("id")
        .then(({ data }) => (data ?? []) as TraitEffect[]),
    );
    effectsCache.then((e) => alive && setEffects(e));
    return () => {
      alive = false;
    };
  }, []);
  return effects;
}
