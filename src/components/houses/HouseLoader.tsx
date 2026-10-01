"use client";

import { useEffect, useMemo, useState } from "react";
import HouseView, { type HouseMemberPg } from "@/app/(gioco)/casata/[id]/HouseView";
import type { FamilyMember, FamilyRelation, House, HouseNpc, HouseRole } from "@/lib/houses";
import { createClient } from "@/lib/supabase/client";

type Data = {
  house: House;
  roles: HouseRole[];
  npcs: HouseNpc[];
  members: HouseMemberPg[];
  family: FamilyMember[];
  relations: FamilyRelation[];
  allNpcs: HouseNpc[];
  allHouses: House[];
};

// Pagina della casata caricata nel browser (per mostrarla dentro una modale)
export default function HouseLoader({ houseId }: { houseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("houses").select("*").eq("id", houseId).single(),
      supabase.from("house_roles").select("*").eq("house_id", houseId).order("sort_order").order("name"),
      supabase.from("house_npcs").select("*").eq("house_id", houseId).order("sort_order").order("name"),
      supabase.from("characters").select("id, name, status, avatar_url, house_role_id").eq("house_id", houseId).order("name"),
      supabase.from("house_family_members").select("*").eq("house_id", houseId).order("sort_order").order("name"),
      supabase.from("house_family_relations").select("*").eq("house_id", houseId).order("created_at"),
      supabase.from("house_npcs").select("*"),
      supabase.from("houses").select("*"),
    ]).then(([house, roles, npcs, members, family, relations, allNpcs, allHouses]) => {
      if (!house.data) return setFailed(true);
      setData({
        house: house.data as House,
        roles: (roles.data ?? []) as HouseRole[],
        npcs: (npcs.data ?? []) as HouseNpc[],
        members: (members.data ?? []) as HouseMemberPg[],
        family: (family.data ?? []) as FamilyMember[],
        relations: (relations.data ?? []) as FamilyRelation[],
        allNpcs: (allNpcs.data ?? []) as HouseNpc[],
        allHouses: (allHouses.data ?? []) as House[],
      });
    });
  }, [supabase, houseId]);

  if (failed) return <p className="text-center text-muted">Casata non trovata.</p>;
  if (!data) return <p className="text-center text-muted">Caricamento...</p>;
  return <HouseView {...data} />;
}
