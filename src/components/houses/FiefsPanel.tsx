"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// il pannello e' diviso in schede
type Tab = "entrate" | "strutture" | "commerci" | "esercito";
const TABS: { id: Tab; label: string }[] = [
  { id: "entrate", label: "Entrate" },
  { id: "strutture", label: "Strutture" },
  { id: "commerci", label: "Commerci" },
  { id: "esercito", label: "Esercito" },
];
import { createClient } from "@/lib/supabase/client";
import HouseArmy from "./HouseArmy";
import HouseTrade from "./HouseTrade";
import HouseEconomy, { type EcoFief, type EcoFiefType, type EcoResource, type EcoStructureType } from "./HouseEconomy";
import { loadHouseTaxes, type HouseTaxes } from "@/lib/taxes-load";
import type { MoodRow } from "@/lib/mood";
import type { UpkeepRow } from "./HouseEconomy";

// Pannello "Feudi" della barra di destra: feudi e tesoro della casata del PG.
// Costruisce solo chi ha un ruolo di casata con "Costruisce nei feudi".
// Lo staff dell'economia (admin, e chi ha il permesso) puo' scegliere una
// qualsiasi casata e vederla e gestirla come il suo signore: il database
// gli permette gia' di costruire, demolire, commerciare e richiamare l'esercito.
type Data = {
  house: { id: string; name: string; playable: boolean };
  fiefs: EcoFief[];
  fiefTypes: EcoFiefType[];
  structureTypes: EcoStructureType[];
  resources: EcoResource[];
  treasury: Record<string, number>;
  builderId: string | null;
  taxes: HouseTaxes | null;
  mood: MoodRow[] | null; // null: migrazione 0143 non ancora eseguita
  upkeep: UpkeepRow[];
};

export default function FiefsPanel({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("entrate");
  // staff: elenco delle casate e casata scelta ("" = la propria)
  const [staffHouses, setStaffHouses] = useState<Data["house"][] | null>(null);
  const [viewAs, setViewAs] = useState("");
  useEffect(() => {
    supabase.rpc("has_permission", { perm: "economia.gestire" }).then(({ data: ok }) => {
      if (ok !== true) return;
      supabase
        .from("houses")
        .select("id, name, playable")
        .order("name")
        .then(({ data: list }) => setStaffHouses((list ?? []) as Data["house"][]));
    });
  }, [supabase]);

  const load = useCallback(async (): Promise<Data | null> => {
    const { data: me } = await supabase
      .from("characters")
      .select("id, house_id, house_role:house_roles(can_build), house:houses(id, name, playable)")
      .eq("id", characterId)
      .maybeSingle();
    // lo staff che guarda un'altra casata la gestisce come il suo signore
    const other = viewAs ? (await supabase.from("houses").select("id, name, playable").eq("id", viewAs).maybeSingle()).data : null;
    const house = (other ?? me?.house ?? null) as unknown as Data["house"] | null;
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
        .select("*, costs:structure_costs(resource_id, amount), incomes:structure_incomes(resource_id, amount), upkeep:structure_upkeep(resource_id, amount)")
        .order("sort_order")
        .order("name"),
      supabase.from("resources").select("id, name").order("sort_order").order("name"),
      supabase.from("house_resources").select("resource_id, amount").eq("house_id", house.id),
    ]);
    const role = me.house_role as unknown as { can_build: boolean } | null;
    const [taxes, mood, upkeep] = await Promise.all([
      loadHouseTaxes(supabase, house.id),
      supabase.rpc("house_mood", { p_house: house.id }),
      supabase.rpc("house_upkeep", { p_house: house.id }),
    ]);
    return {
      house,
      fiefs: (fiefs.data ?? []) as unknown as EcoFief[],
      fiefTypes: (fiefTypes.data ?? []) as unknown as EcoFiefType[],
      structureTypes: (structureTypes.data ?? []) as unknown as EcoStructureType[],
      resources: (resources.data ?? []) as EcoResource[],
      treasury: Object.fromEntries((treasury.data ?? []).map((t) => [t.resource_id as string, Number(t.amount)])),
      builderId: other || role?.can_build ? me.id : null,
      taxes,
      mood: mood.error ? null : ((mood.data ?? []) as MoodRow[]),
      upkeep: (upkeep.data ?? []) as UpkeepRow[],
    };
  }, [supabase, characterId, viewAs]);

  useEffect(() => {
    load().then(setData);
  }, [load]);

  // scelta della casata (solo staff)
  const picker = staffHouses && (
    <label className="flex flex-wrap items-center gap-2 border border-[#d4a72c]/40 bg-[#d4a72c]/10 px-3 py-2 text-xs text-[#f0c75e]">
      Staff · vedi e gestisci come la casata
      <select
        value={viewAs}
        onChange={(e) => {
          setViewAs(e.target.value);
          setData(undefined);
        }}
        className="input w-auto! py-1 text-sm text-foreground"
      >
        <option value="">la tua</option>
        {staffHouses.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
            {h.playable ? "" : " (PNG)"}
          </option>
        ))}
      </select>
    </label>
  );

  if (data === undefined) return <>{picker}<p className="text-center text-muted">Caricamento...</p></>;
  if (data === null)
    return (
      <>
        {picker}
        <p className="py-6 text-center text-muted">Il tuo personaggio non appartiene a una casata.</p>
      </>
    );

  // attacco e difesa delle strutture dei feudi: entrano nella potenza della casata
  const fiefPoints = { attack: 0, defense: 0 };
  for (const fief of data.fiefs)
    for (const s of fief.structures) {
      const type = data.structureTypes.find((t) => t.id === s.structure_type_id);
      fiefPoints.attack += type?.attack ?? 0;
      fiefPoints.defense += type?.defense ?? 0;
    }

  const economy = (part: "entrate" | "strutture") => (
    <HouseEconomy
      part={part}
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
      mood={data.mood}
      upkeep={data.upkeep}
      bare
    />
  );

  return (
    <div className="space-y-4">
      {picker}
      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 font-serif text-sm tracking-wide uppercase ${tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "entrate" && economy("entrate")}
      {tab === "strutture" && economy("strutture")}
      {tab === "commerci" && (
        <HouseTrade houseId={data.house.id} canManage={!!data.builderId} resources={data.resources} onChanged={() => load().then(setData)} />
      )}
      {tab === "esercito" && (
        <HouseArmy houseId={data.house.id} fief={fiefPoints} canCommand={!!data.builderId} resources={data.resources} onChanged={() => load().then(setData)} />
      )}
    </div>
  );
}
