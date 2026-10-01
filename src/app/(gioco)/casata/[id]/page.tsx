import { notFound } from "next/navigation";
import { GameArea } from "@/components/game/GameShell";
import type { FamilyMember, FamilyRelation, House, HouseNpc, HouseRole } from "@/lib/houses";
import { requireUser } from "@/lib/supabase/server";
import HouseView, { type HouseMemberPg } from "./HouseView";

// Pagina di una casata, aperta da Utility giocatore -> Casate PG
export default async function CasataPage({ params }: PageProps<"/casata/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();

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
    </div>
  );
}
