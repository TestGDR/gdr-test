import { notFound } from "next/navigation";
import { GameArea } from "@/components/game/GameShell";
import type { FamilyMember, FamilyRelation, House, HouseNpc, HouseRole } from "@/lib/houses";
import { requireUser } from "@/lib/supabase/server";
import HouseView, { type HouseMemberPg } from "./HouseView";
import HouseEconomy, { type EcoFief, type EcoFiefType, type EcoResource, type EcoStructureType } from "@/components/houses/HouseEconomy";
import { loadHouseTaxes } from "@/lib/taxes-load";

// Pagina di una casata, aperta da Utility giocatore -> Casate PG
export default async function CasataPage({ params }: PageProps<"/casata/[id]">) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  // Tutte le letture partono insieme (dipendono solo dalla casata e dall utente)
  const [
    { data: house },
    roles, npcs, members, family, relations, allNpcs, allHouses,
    fiefs, fiefTypes, structureTypes, resources, treasury,
    { data: meRow },
    taxes,
  ] = await Promise.all([
    supabase.from("houses").select("*").eq("id", id).maybeSingle<House>(),
    supabase.from("house_roles").select("*").eq("house_id", id).order("sort_order").order("name"),
    supabase.from("house_npcs").select("*").eq("house_id", id).order("sort_order").order("name"),
    supabase
      .from("characters")
      .select("id, name, status, avatar_url, house_role_id")
      .eq("house_id", id)
      .order("name"),
    supabase.from("house_family_members").select("*").eq("house_id", id).order("sort_order").order("name"),
    supabase.from("house_family_relations").select("*").eq("house_id", id).order("created_at"),
    // per l'albero: PNG e casate di provenienza dei membri collegati
    supabase.from("house_npcs").select("*"),
    supabase.from("houses").select("*"),
    // Economia: feudi (li vedono tutti), tesoro (solo i membri: le regole del database), chi puo' costruire
    supabase
      .from("fiefs")
      .select("*, location:locations(name), structures:fief_structures(*)")
      .eq("house_id", id)
      .order("name"),
    supabase.from("fief_types").select("id, name, incomes:fief_type_incomes(resource_id, amount)"),
    supabase
      .from("structure_types")
      .select("*, costs:structure_costs(resource_id, amount), incomes:structure_incomes(resource_id, amount), upkeep:structure_upkeep(resource_id, amount)")
      .order("sort_order")
      .order("name"),
    supabase.from("resources").select("id, name").order("sort_order").order("name"),
    supabase.from("house_resources").select("resource_id, amount").eq("house_id", id),
    // il mio personaggio principale (il piu' vecchio), con casata e ruolo
    supabase
      .from("characters")
      .select("id, house_id, house_role:house_roles(can_build)")
      .eq("owner_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    loadHouseTaxes(supabase, id),
  ]);
  if (!house) notFound();
  const isMember = meRow?.house_id === id;
  const canBuild = isMember && !!(meRow?.house_role as unknown as { can_build: boolean } | null)?.can_build;

  return (
    <div className="mx-auto max-w-6xl">
      <GameArea title={`Casata ${house.name}`} image={house.sigil_url} />
      <HouseView
        house={house}
        roles={(roles.data ?? []) as HouseRole[]}
        npcs={(npcs.data ?? []) as HouseNpc[]}
        members={(members.data ?? []) as HouseMemberPg[]}
        family={(family.data ?? []) as FamilyMember[]}
        relations={(relations.data ?? []) as FamilyRelation[]}
        allNpcs={(allNpcs.data ?? []) as HouseNpc[]}
        allHouses={(allHouses.data ?? []) as House[]}
      />
      <HouseEconomy
        houseName={house.name}
        playable={house.playable}
        fiefs={(fiefs.data ?? []) as unknown as EcoFief[]}
        fiefTypes={(fiefTypes.data ?? []) as unknown as EcoFiefType[]}
        structureTypes={(structureTypes.data ?? []) as unknown as EcoStructureType[]}
        resources={(resources.data ?? []) as EcoResource[]}
        treasury={isMember ? Object.fromEntries((treasury.data ?? []).map((t) => [t.resource_id as string, Number(t.amount)])) : null}
        isMember={isMember}
        builderId={canBuild && meRow ? (meRow.id as string) : null}
        taxes={taxes}
      />
    </div>
  );
}
