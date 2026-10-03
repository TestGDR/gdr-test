import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import type { DragonSkill } from "@/lib/dragon-skills";
import type { Dragon, DragonStage, TraitEffect } from "@/lib/dragons";
import { requirePermission } from "@/lib/staff";
import DragonsManager, { type HouseLite, type NpcLite, type PgLite, type TemperamentRow, type TraitRow } from "./DragonsManager";

export default async function DraghiPage() {
  const { supabase } = await requirePermission("draghi.gestire");

  const [houses, dragons, stages, traits, pgs, skills, temperaments, effects, npcs, settings] = await Promise.all([
    supabase.from("houses").select("id, name, sigil_url").order("sort_order").order("name"),
    supabase.from("dragons").select("*").order("created_at"),
    supabase.from("dragon_stages").select("*").order("sort_order"),
    supabase.from("dragon_trait_pairs").select("*").order("pregio"),
    supabase.from("characters").select("id, name, house_id, px, status").order("name"),
    supabase.from("dragon_skills").select("*").order("sort_order").order("label"),
    supabase.from("dragon_temperaments").select("id, text").order("id"),
    supabase.from("dragon_trait_effects").select("*").order("id"),
    supabase.from("house_npcs").select("id, name, house_id, deceased").order("name"),
    supabase.from("dragon_settings").select("skill_px_factor").maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <GameArea title="Draghi" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">Draghi</h1>
      <DragonsManager
        houses={(houses.data ?? []) as HouseLite[]}
        dragons={(dragons.data ?? []) as Dragon[]}
        stages={(stages.data ?? []) as DragonStage[]}
        traits={(traits.data ?? []) as TraitRow[]}
        pgs={(pgs.data ?? []) as PgLite[]}
        npcs={(npcs.data ?? []) as NpcLite[]}
        skillFactor={settings.data?.skill_px_factor ?? 10}
        skills={(skills.data ?? []) as DragonSkill[]}
        temperaments={(temperaments.data ?? []) as TemperamentRow[]}
        effects={(effects.data ?? []) as TraitEffect[]}
      />
    </div>
  );
}
