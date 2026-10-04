import { notFound } from "next/navigation";
import { GameArea } from "@/components/game/GameShell";
import type { FamilyMember, FamilyRelation, House, HouseNpc, HouseRole } from "@/lib/houses";
import { requireUser } from "@/lib/supabase/server";
import HouseView, { type HouseMemberPg } from "./HouseView";
import HouseEconomy, { type EcoFief, type EcoFiefType, type EcoResource, type EcoStructureType } from "@/components/houses/HouseEconomy";
import { getMainCharacter } from "@/lib/main-character";
import { loadHouseTaxes } from "@/lib/taxes-load";

// Pagina di una casata, aperta da Utility giocatore -> Casate PG
export default async function CasataPage({ params }: PageProps<"/casata/[id]">) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  const { data: house } = await supabase.from("houses").select("*").eq("id", id).maybeSingle<House>();
  if (!house) notFound();

  const [roles, npcs, members, family, relations, allNpcs, allHouses] = await Promise.all([
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
  ]);

  // Economia: feudi (li vedono tutti), tesoro (solo i membri: le regole del database), chi puo' costruire
  const [fiefs, fiefTypes, structureTypes, resources, treasury, me] = await Promise.all([
    supabase
      .from("fiefs")
      .select("id, name, size, fief_type_id, description, location:locations(name), structures:fief_structures(id, structure_type_id, is_background)")
      .eq("house_id", id)
      .order("name"),
    supabase.from("fief_types").select("id, name, incomes:fief_type_incomes(resource_id, amount)"),
    supabase
      .from("structure_types")
      .select("id, name, description, attack, defense, costs:structure_costs(resource_id, amount), incomes:structure_incomes(resource_id, amount), upkeep:structure_upkeep(resource_id, amount)")
      .order("sort_order")
      .order("name"),
    supabase.from("resources").select("id, name").order("sort_order").order("name"),
    supabase.from("house_resources").select("resource_id, amount").eq("house_id", id),
    getMainCharacter(supabase, user.id),
  ]);
  const { data: meRow } = me
    ? await supabase.from("characters").select("id, house_id, house_role_id").eq("id", me.id).maybeSingle()
    : { data: null };
  const isMember = meRow?.house_id === id;
  const taxes = await loadHouseTaxes(supabase, id);
  const canBuild =
    isMember && meRow?.house_role_id
      ? !!(await supabase.from("house_roles").select("can_build").eq("id", meRow.house_role_id).maybeSingle()).data?.can_build
      : false;

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
