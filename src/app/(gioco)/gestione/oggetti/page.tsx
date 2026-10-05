import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import type {
  Category,
  Item,
  Quality,
  Slot,
} from "@/components/scheda/Equipment";
import { requirePermission } from "@/lib/staff";
import ItemsManager from "./ItemsManager";

export default async function OggettiPage() {
  const { supabase } = await requirePermission("oggetti.gestire");

  const [slots, categories, qualities, items] = await Promise.all([
    supabase
      .from("equipment_slots")
      .select("*")
      .order("sort_order")
      .order("name"),
    supabase
      .from("item_categories")
      .select("*")
      .order("sort_order")
      .order("name"),
    supabase.from("item_qualities").select("*").order("level"),
    supabase.from("items").select("*").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <GameArea title="Oggetti" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-5 font-serif text-3xl tracking-wide text-accent">
        Oggetti
      </h1>
      <ItemsManager
        slots={(slots.data ?? []) as Slot[]}
        categories={(categories.data ?? []) as Category[]}
        qualities={(qualities.data ?? []) as Quality[]}
        items={(items.data ?? []) as Item[]}
      />
    </div>
  );
}
