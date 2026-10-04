"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import HouseEconomy, { type EcoFief, type EcoFiefType, type EcoResource, type EcoStructureType } from "./HouseEconomy";
import { loadHouseTaxes, type HouseTaxes } from "@/lib/taxes-load";

// Pannello "Feudi" della barra di destra: feudi e tesoro della casata del PG.
// Costruisce solo chi ha un ruolo di casata con "Costruisce nei feudi".
type Data = {
  house: { id: string; name: string; playable: boolean };
  fiefs: EcoFief[];
  fiefTypes: EcoFiefType[];
  structureTypes: EcoStructureType[];
  resources: EcoResource[];
  treasury: Record<string, number>;
  builderId: string | null;
  taxes: HouseTaxes | null;
};

export default function FiefsPanel({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null | undefined>(undefined);

  const load = useCallback(async (): Promise<Data | null> => {
    const { data: me } = await supabase
      .from("characters")
      .select("id, house_id, house_role:house_roles(can_build), house:houses(id, name, playable)")
      .eq("id", characterId)
      .maybeSingle();
    const house = (me?.house ?? null) as unknown as Data["house"] | null;
    if (!me || !house) return null;
    const [fiefs, fiefTypes, structureTypes, resources, treasury] = await Promise.all([
      supabase
        .from("fiefs")
        .select("id, name, size, fief_type_id, description, location:locations(name), structures:fief_structures(id, structure_type_id, is_background)")
        .eq("house_id", house.id)
        .order("name"),
      supabase.from("fief_types").select("id, name, incomes:fief_type_incomes(resource_id, amount)"),
      supabase
        .from("structure_types")
        .select("id, name, description, attack, defense, costs:structure_costs(resource_id, amount), incomes:structure_incomes(resource_id, amount), upkeep:structure_upkeep(resource_id, amount)")
        .order("sort_order")
        .order("name"),
      supabase.from("resources").select("id, name").order("sort_order").order("name"),
      supabase.from("house_resources").select("resource_id, amount").eq("house_id", house.id),
    ]);
    const role = me.house_role as unknown as { can_build: boolean } | null;
    const taxes = await loadHouseTaxes(supabase, house.id);
    return {
      house,
      fiefs: (fiefs.data ?? []) as unknown as EcoFief[],
      fiefTypes: (fiefTypes.data ?? []) as unknown as EcoFiefType[],
      structureTypes: (structureTypes.data ?? []) as unknown as EcoStructureType[],
      resources: (resources.data ?? []) as EcoResource[],
      treasury: Object.fromEntries((treasury.data ?? []).map((t) => [t.resource_id as string, Number(t.amount)])),
      builderId: role?.can_build ? me.id : null,
      taxes,
    };
  }, [supabase, characterId]);

  useEffect(() => {
    load().then(setData);
  }, [load]);

  if (data === undefined) return <p className="text-center text-muted">Caricamento...</p>;
  if (data === null) return <p className="py-6 text-center text-muted">Il tuo personaggio non appartiene a una casata.</p>;

  return (
    <HouseEconomy
      houseName={data.house.name}
      playable={data.house.playable}
      fiefs={data.fiefs}
      fiefTypes={data.fiefTypes}
      structureTypes={data.structureTypes}
      resources={data.resources}
      treasury={data.treasury}
      isMember
      builderId={data.builderId}
      onChanged={() => load().then(setData)}
      taxes={data.taxes}
      bare
    />
  );
}
