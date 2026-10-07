import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import type { Skill, Trait } from "@/lib/rules/catalog";
import { requirePermission } from "@/lib/staff";
import RulesManager from "./RulesManager";

export default async function RegolePage() {
  const { supabase } = await requirePermission("regole.gestire");

  const [skills, traits] = await Promise.all([
    supabase.from("skills").select("*").order("sort_order").order("name"),
    supabase
      .from("traits")
      .select("*")
      .order("kind")
      .order("sort_order")
      .order("name"),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <GameArea title="Abilità e tratti" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">
        Abilità e tratti
      </h1>
      <RulesManager
        skills={(skills.data ?? []) as Skill[]}
        traits={(traits.data ?? []) as Trait[]}
      />
    </div>
  );
}
